// Records the /analysis/ tour as a video: the page without the site's header and footer, the app window centred in a
// 16:9 frame, from the empty page to the finished playground plus a short hold.
//
//   npm run record:analysis                      180 fps, 1080p, supersampled 2×: recordings/analysis-1080p180.mp4
//   npm run record:analysis -- --fps 60 --out D:/videos/analysis.mp4
//
// Frame-perfect, not a screen capture: chrome-headless-shell runs the page on a virtual clock with BeginFrame control,
// so each frame advances the page's timers, Date / performance.now and its animations by exactly 1/fps s, however
// long the frame takes to render. Loads finish in real time while the clock stands still. Every frame is rendered at
// --scale device pixels per CSS pixel and downscaled to the output size (Lanczos), so thin text and lines are
// anti-aliased instead of hard single pixels that break up when a player scales the video.
//
// The video is H.264 at visually lossless quality, encoded on the GPU (NVENC); nothing but the .mp4 is written. The browsers and ffmpeg run at
// below-normal priority, so the machine stays usable. The timeline is cut into chunks rendered by parallel workers (separate browsers; each replays
// the tour up to its chunk without drawing), and the chunks are joined without re-encoding. Each join is checked: the frame before
// a chunk, rendered by that chunk's worker, is compared with the last frame of the chunk before (PSNR). The replays
// differ by a few anti-aliased pixels, which no one can see; a visible difference is reported.
//
// Needs:
//   chrome-headless-shell   npx playwright install chromium-headless-shell   (or --chrome / CHROME=path)
//   ffmpeg                  with NVENC (an NVIDIA GPU): on PATH, or --ffmpeg / FFMPEG=path; or with libx264 for
//                           --encoder x264 on a machine without one
//
// Options (all optional):
//   --fps 180          frames per second
//   --width 1920       output size; the page is laid out at this size in CSS pixels
//   --height 1080
//   --scale 2         supersampling: device pixels per CSS pixel while rendering (1 renders at the output size)
//   --hold 3           seconds kept on the finished playground after the tour ends
//   --shadows 0        strength of the drop shadows (window, split-view panes, menus, pickers, tips) against the
//                      page's: 1 keeps them as on the site; on video even faint ones read as dark halos
//   --workers 2        browsers rendering at once (each takes a few CPU cores)
//   --chunk <s>        seconds of video per chunk; default one chunk per worker
//   --out <file>       the .mp4; default recordings/analysis-<height>p<fps>.mp4
//   --url <url>        record a running server's page instead of building the site and serving dist/
//   --no-build         serve the existing dist/ without running astro build first
//   --limit <s>        only the first <s> seconds, for a quick check
//   --encoder nvenc    nvenc: H.264 on an NVIDIA GPU; x264: H.264 on the CPU (libx264, CRF 12), for machines without
//                      one. Slower, and it competes with the browsers for the CPU, so use fewer workers
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { constants, homedir, setPriority, tmpdir, uptime } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { analysisPage, findFfmpeg, injectCss, launchChrome, pageCss, parseArgs, ROOT, RUN_ACTIVE } from './analysis-page.mjs'

/** Keeps the machine usable while the browsers and encoders work */
const lowerPriority = pid => { try { setPriority(pid, constants.priority.PRIORITY_BELOW_NORMAL) } catch { } }
lowerPriority(process.pid)

// ── Options ──────────────────────────────────────────────────────────────────
const { flag, option } = parseArgs()
const FPS = Number(option('fps', 180))
const W = Number(option('width', 1920)), H = Number(option('height', 1080))
const SCALE = Number(option('scale', 2))
const HOLD = Math.round(Number(option('hold', 3)) * FPS)
const WORKERS = Math.max(1, Number(option('workers', 2)))
// One chunk per worker by default (the tour runs about 90 s): each worker replays the tour up to its chunk, so
// fewer, longer chunks replay less
const CHUNK = Math.round(Number(option('chunk', Math.ceil(95 / WORKERS))) * FPS)
const OUT = resolve(option('out', join(ROOT, 'recordings', `analysis-${H}p${FPS}.mp4`)))
const LIMIT = option('limit') ? Math.round(Number(option('limit')) * FPS) : Infinity
const INTERVAL = 1000 / FPS
const ENCODER = option('encoder', 'nvenc')
if (!['nvenc', 'x264'].includes(ENCODER)) throw new Error(`--encoder must be nvenc or x264, not ${ENCODER}`)
/** Run-end checks land on the same frames in every worker, so all of them agree where the tour ends */
const CHECK_EVERY = Math.max(1, Math.round(FPS / 2))
/** The longest the tour may take before the recording gives up */
const MAX_FRAMES = 300 * FPS

const PAGE_CSS = pageCss(Number(option('shadows', 0)))

// ── Tools ────────────────────────────────────────────────────────────────────
function findChrome() {
    const given = option('chrome', process.env.CHROME)
    if (given) return given
    const caches = [
        process.env.PLAYWRIGHT_BROWSERS_PATH,
        process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'ms-playwright'),
        join(homedir(), 'Library', 'Caches', 'ms-playwright'),
        join(homedir(), '.cache', 'ms-playwright'),
    ].filter(Boolean)
    for (const cache of caches) {
        if (!existsSync(cache)) continue
        const builds = readdirSync(cache).filter(d => d.startsWith('chromium_headless_shell-'))
            .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
        for (const build of builds) for (const platform of readdirSync(join(cache, build))) {
            for (const exe of ['chrome-headless-shell.exe', 'chrome-headless-shell']) {
                const path = join(cache, build, platform, exe)
                if (existsSync(path)) return path
            }
        }
    }
    throw new Error('chrome-headless-shell not found: run `npx playwright install chromium-headless-shell`, or pass --chrome <path>')
}

const CHROME = findChrome()
const FFMPEG = findFfmpeg(option('ffmpeg', process.env.FFMPEG))

// ── One browser ──────────────────────────────────────────────────────────────
/** chrome-headless-shell on a virtual clock, with a CDP connection to one page */
async function openBrowser(profile) {
    const { send, on, close } = await launchChrome(CHROME, [
        '--deterministic-mode', '--enable-begin-frame-control', '--run-all-compositor-stages-before-draw',
        '--disable-threaded-animation', '--disable-threaded-scrolling', '--disable-checker-imaging',
        '--disable-new-content-rendering-timeout', '--disable-image-animation-resync',
        '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb',
        `--force-device-scale-factor=${SCALE}`, `--window-size=${W},${H}`, 'about:blank',
    ], profile, { onSpawn: chrome => lowerPriority(chrome.pid) })

    const { targetId } = await send('Target.createTarget', { url: 'about:blank', enableBeginFrameControl: true, width: W, height: H })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    const page = (method, params) => send(method, params, sessionId)
    const next = method => new Promise(r => {
        const off = on(m => { if (m.method === method && m.sessionId === sessionId) { off(); r(m) } })
    })
    const inflight = new Set()
    on(m => {
        if (m.sessionId !== sessionId) return
        if (m.method === 'Network.requestWillBeSent') inflight.add(m.params.requestId)
        else if (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') inflight.delete(m.params.requestId)
    })

    await page('Network.enable')
    await page('Page.enable')
    await page('Runtime.enable')
    await page('HeadlessExperimental.enable').catch(() => { })
    await page('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: false })
    await page('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] })
    await page('Page.addScriptToEvaluateOnNewDocument', {
        source: injectCss(PAGE_CSS),
    })
    await page('Emulation.setVirtualTimePolicy', { policy: 'pause' })

    // Renderer TimeTicks are ms of uptime; frame times must be ahead of the real clock or the animation timeline
    // ignores them
    const base = Math.ceil(uptime() * 1000) + 60_000
    let frames = 0
    return {
        navigate: url => { page('Page.navigate', { url }) },
        /**
         * Advances the clock one frame; with `shot`, draws it and returns it as a PNG (null if nothing changed). Without,
         * the frame runs (timers, animations, layout) but isn't drawn: a worker replaying the tour up to its chunk
         * skips the drawing, which is most of a frame's cost
         */
        async frame(shot) {
            // A load finishes in real time while the page's clock stands still, so it takes no video time beyond
            // what the page itself waits
            while (inflight.size) await new Promise(r => setTimeout(r, 2))
            const expired = next('Emulation.virtualTimeBudgetExpired')
            await page('Emulation.setVirtualTimePolicy', { policy: 'advance', budget: INTERVAL })
            await expired
            frames++
            const r = await page('HeadlessExperimental.beginFrame', {
                frameTimeTicks: base + frames * INTERVAL, interval: INTERVAL,
                ...(shot ? { screenshot: { format: 'png', optimizeForSpeed: true } } : { noDisplayUpdates: true }),
            })
            return r.screenshotData ? Buffer.from(r.screenshotData, 'base64') : null
        },
        async evaluate(expression) {
            const { result } = await page('Runtime.evaluate', { expression, returnByValue: true })
            return result.value
        },
        close,
    }
}

// ── One chunk ────────────────────────────────────────────────────────────────
/** Below this PSNR (dB) between the two renders of a join's frame, the difference could be visible */
const JOIN_PSNR = 45

/**
 * Renders frames [start, end) of the video into `file` (fewer if the tour ends sooner), replaying the frames before
 * `start` without capturing them. Returns where the tour ended if this worker saw it, and the frame before `start`
 * and its own last frame (as PNG files, to check the joins).
 */
async function renderChunk({ url, index, start, end, file, signal }) {
    const browser = await openBrowser(join(tmpdir(), `tnr-record-${process.pid}-${index}`))
    let ffmpeg = null, last = null, before = null, runEnd = null, seenRun = false, n = 0, written = 0
    try {
        browser.navigate(url)
        // The video starts at the page's first paint
        for (let i = 0; !last; i++) {
            if (i > 30 * FPS) throw new Error('the page never painted')
            last = await browser.frame(true)
        }
        for (; n < Math.min(end, LIMIT, runEnd === null ? Infinity : runEnd + HOLD); n++) {
            if (signal.aborted) return { aborted: true }
            if (n >= MAX_FRAMES) throw new Error(`the tour did not end within ${MAX_FRAMES / FPS} s`)
            // Screenshots are only taken from the frame before the chunk; frame 0 is the first paint
            const shot = n >= start - 1 && n > 0
            const png = shot ? await browser.frame(true) : n > 0 ? await browser.frame(false) : null
            if (png) last = png
            if (n === start - 1) writeFileSync(before = file.replace(/\.mp4$/, '-before.png'), last)
            if (n >= start) {
                if (!ffmpeg) ffmpeg = openEncoder(file)
                if (!ffmpeg.stdin.write(last)) await new Promise(r => ffmpeg.stdin.once('drain', r))
                written++
            }
            if (n % CHECK_EVERY === 0) {
                const active = await browser.evaluate(RUN_ACTIVE)
                if (active) seenRun = true
                else if (seenRun && runEnd === null) {
                    runEnd = n
                    if (runEnd + HOLD <= start) return { runEnd, empty: true }
                }
            }
        }
        const lastFile = file.replace(/\.mp4$/, '-last.png')
        writeFileSync(lastFile, last)
        return { runEnd, before, last: lastFile, frames: written }
    } finally {
        if (ffmpeg) { ffmpeg.stdin.end(); await new Promise(r => ffmpeg.on('close', r)) }
        await browser.close()
    }
}

/**
 * ffmpeg taking the browser's PNG frames on stdin: each is downscaled (Lanczos) into BT.709 YUV on the CPU, then
 * encoded on the GPU by NVENC as H.264 (visually lossless, the High profile, a keyframe every second). Not scaled on
 * the GPU: scale_cuda on RGB frames fringes and breaks up thin text. Not converted by NVENC: its RGB input uses the
 * BT.601 matrix and shifts saturated colours. With --encoder x264, libx264 on the CPU instead, at CRF 12 (also visually
 * lossless) with the same keyframe interval and colour tags, so its chunks join the same way.
 */
function openEncoder(file) {
    const codec = ENCODER === 'x264'
        ? ['-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-profile:v', 'high', '-g', String(FPS), '-keyint_min', String(FPS)]
        : ['-c:v', 'h264_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'constqp', '-qp', '10', '-profile:v', 'high', '-g', String(FPS)]
    const ffmpeg = spawn(FFMPEG, [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
        '-vf', `scale=${W}:${H}:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
        ...codec,
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
        file,
    ], { stdio: ['pipe', 'inherit', 'inherit'] })
    lowerPriority(ffmpeg.pid)
    return ffmpeg
}

/** PSNR in dB between two images (Infinity when identical) */
function comparePngs(a, b) {
    const r = spawnSync(FFMPEG, ['-hide_banner', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8' })
    const value = /average:(\S+)/.exec(r.stderr)?.[1]
    return value === undefined ? 0 : value === 'inf' ? Infinity : Number(value)
}

// ── The recording ────────────────────────────────────────────────────────────
async function main() {
    const page = await analysisPage({ url: option('url'), build: !flag('no-build') })
    const url = page.url
    const work = join(tmpdir(), `tnr-record-${process.pid}-chunks`)
    mkdirSync(work, { recursive: true })
    console.log(`Recording ${url} at ${W}×${H}, ${FPS} fps, rendered at ${SCALE}× (${WORKERS} workers, ${CHUNK / FPS} s chunks)`)

    const started = Date.now()
    const results = []
    const controllers = new Map()
    let total = LIMIT, nextChunk = 0
    // Chunks start in order, WORKERS at a time; once a worker sees the tour end, chunks past it are dropped
    const worker = async () => {
        for (; ;) {
            const index = nextChunk++, start = index * CHUNK
            if (start >= total) return
            const controller = new AbortController()
            controllers.set(index, { controller, start })
            const file = join(work, `chunk-${String(index).padStart(3, '0')}.mp4`)
            const result = await renderChunk({ url, index, start, end: start + CHUNK, file, signal: controller.signal })
            controllers.delete(index)
            if (result.runEnd != null && result.runEnd + HOLD < total) {
                total = result.runEnd + HOLD
                console.log(`  the tour ends at ${(result.runEnd / FPS).toFixed(2)} s; the video is ${(total / FPS).toFixed(2)} s`)
                for (const [, c] of controllers) if (c.start >= total) c.controller.abort()
            }
            if (!result.aborted && !result.empty && result.frames) {
                results[index] = { ...result, file }
                const done = results.filter(Boolean).reduce((sum, r) => sum + r.frames, 0)
                console.log(`  chunk ${index + 1} done (${(start / FPS).toFixed(0)}–${((start + result.frames) / FPS).toFixed(1)} s), ` +
                    `${(done / FPS).toFixed(1)} s rendered in ${((Date.now() - started) / 60000).toFixed(1)} min`)
            }
        }
    }
    try {
        await Promise.all(Array.from({ length: WORKERS }, worker))
        const chunks = results.filter(Boolean)
        const frames = chunks.reduce((sum, r) => sum + r.frames, 0)
        if (frames !== total) throw new Error(`rendered ${frames} frames, expected ${total}`)
        // The frame before each chunk, from its own worker, against the last frame of the chunk before
        let lowest = Infinity
        for (let i = 1; i < chunks.length; i++) {
            const psnr = comparePngs(chunks[i - 1].last, chunks[i].before)
            lowest = Math.min(lowest, psnr)
            if (psnr < JOIN_PSNR) console.warn(`  warning: the join before chunk ${i + 1} differs visibly (PSNR ${psnr.toFixed(1)} dB); the workers' replays diverged`)
        }
        if (chunks.length > 1) console.log(`  joins checked: the closest call is ${lowest === Infinity ? 'identical' : `${lowest.toFixed(1)} dB PSNR`} (visible below ${JOIN_PSNR} dB)`)
        const list = join(work, 'chunks.txt')
        writeFileSync(list, chunks.map(r => `file '${r.file.replace(/\\/g, '/')}'`).join('\n'))
        mkdirSync(dirname(OUT), { recursive: true })
        const join_ = spawnSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
            '-c', 'copy', '-movflags', '+faststart', OUT], { stdio: 'inherit' })
        if (join_.status !== 0) throw new Error('joining the chunks failed')
        console.log(`Done in ${((Date.now() - started) / 60000).toFixed(1)} min: ${OUT} (${(frames / FPS).toFixed(2)} s, ` +
            `${frames} frames, ${(statSync(OUT).size / 1e6).toFixed(0)} MB)`)
    } finally {
        rmSync(work, { recursive: true, force: true })
        page.close()
    }
}

main().then(() => process.exit(0), error => { console.error(error.message ?? error); process.exit(1) })
