// Films the /analysis/ tour in real time: a real Chrome plays it full screen on the GPU and ffmpeg captures the screen.
// The tour takes 90 s, so a video takes about two minutes, where the frame-by-frame recorder
// (record-analysis-video.mjs) takes 20 or more. The trade: it runs at the display's own refresh rate and resolution,
// a frame can drop if the machine is busy, and the screen can't be used while it films.
//
//   npm run capture:analysis                    → recordings/analysis-capture-1080p<fps>.mp4
//   npm run capture:analysis -- --display 1     another display
//
// On a 2× HiDPI (Retina) Mac the browser draws at twice the resolution and the capture is downscaled to the output
// size, so text is supersampled as in the frame-by-frame recorder. On a 1× display it is filmed as drawn.
//
// Two passes: the screen is captured at its own resolution into a near-lossless temporary file by the GPU encoder
// (NVENC on Windows, VideoToolbox on macOS), so the capture keeps up in real time. That is then trimmed to the tour,
// cropped to 16:9 from the middle (the window is centred) and downscaled (Lanczos) to the output: H.264, BT.709.
//
// Needs:
//   Google Chrome (or --chrome <path>)
//   ffmpeg: on Windows with NVENC (an NVIDIA GPU) and ddagrab; on macOS with avfoundation and VideoToolbox
//           (brew install ffmpeg). On macOS, the terminal running it needs Screen Recording permission
//           (System Settings → Privacy & Security).
//
// Options (all optional):
//   --display <n>      the display to film: Windows, the output index (0 is the first); macOS, the screen number
//                      (0 is the main display). Chrome opens full screen on it.
//   --fps <n>          capture rate; default the display's refresh rate, measured in the browser
//   --width 1920       output size
//   --height 1080
//   --hold 3           seconds kept on the finished playground after the tour ends
//   --shadows 0        strength of the drop shadows against the site's (see record-analysis-video.mjs)
//   --out <file>       default recordings/analysis-capture-<height>p<fps>.mp4
//   --url <url>        film a running server's page instead of building the site and serving dist/
//   --no-build         serve the existing dist/ without running astro build first
//   --chrome <path>    the browser to film
//   --ffmpeg <path>
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { analysisPage, findFfmpeg, injectCss, launchChrome, PAGE_BG, pageCss, parseArgs, ROOT, RUN_ACTIVE } from './analysis-page.mjs'

const { flag, option } = parseArgs()
const MAC = process.platform === 'darwin'
if (!MAC && process.platform !== 'win32') throw new Error('Screen capture is set up for Windows and macOS only')
const DISPLAY = Number(option('display', 0))
const W = Number(option('width', 1920)), H = Number(option('height', 1080))
const HOLD = Number(option('hold', 3))
const FFMPEG = findFfmpeg(option('ffmpeg', process.env.FFMPEG))
const sleep = ms => new Promise(r => setTimeout(r, ms))

function findChrome() {
    const given = option('chrome', process.env.CHROME)
    if (given) return given
    const candidates = MAC
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
        : [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
            .filter(Boolean).map(dir => join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe'))
    const found = candidates.find(existsSync)
    if (!found) throw new Error('Google Chrome not found: install it or pass --chrome <path>')
    return found
}

/** On macOS, avfoundation's device index for "Capture screen <n>" (cameras are listed first) */
function macScreenDevice(screen) {
    const r = spawnSync(FFMPEG, ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''], { encoding: 'utf8' })
    const match = new RegExp(`\\[(\\d+)\\] Capture screen ${screen}\\b`).exec(r.stderr)
    if (!match) throw new Error(`no "Capture screen ${screen}" in ffmpeg's avfoundation devices:\n${r.stderr}`)
    return match[1]
}

/**
 * ffmpeg capturing the display at its own resolution into `file`, near-lossless (the GPU encoder keeps up in real
 * time). It reports progress on stdout; 'q' on stdin stops it.
 */
function startCapture(file, fps) {
    const input = MAC
        ? ['-f', 'avfoundation', '-capture_cursor', '0', '-framerate', String(fps), '-pixel_format', 'nv12', '-i', `${macScreenDevice(DISPLAY)}:none`,
            '-c:v', 'hevc_videotoolbox', '-b:v', '250M', '-tag:v', 'hvc1']
        // Desktop Duplication on the GPU; the frames are brought back to convert them to BT.709 4:4:4 (NVENC's own
        // RGB conversion is BT.601) and encoded near-lossless
        : ['-f', 'lavfi', '-i', `ddagrab=output_idx=${DISPLAY}:framerate=${fps}:draw_mouse=0`,
            '-vf', 'hwdownload,format=bgra,scale=out_color_matrix=bt709:out_range=tv,format=yuv444p',
            '-c:v', 'hevc_nvenc', '-preset', 'p4', '-tune', 'hq', '-rc', 'constqp', '-qp', '4']
    return spawn(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-stats_period', '0.1', ...input,
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', file],
        { stdio: ['pipe', 'pipe', 'inherit'] })
}

async function main() {
    const page = await analysisPage({ url: option('url'), build: !flag('no-build') })
    const work = join(tmpdir(), `tnr-capture-${process.pid}`)
    mkdirSync(work, { recursive: true })
    let browser = null, capture = null, keep = false
    try {
        // Chrome full screen on the display, on a blank page in the page's background colour
        const position = MAC ? [] : await displayOrigin(DISPLAY)
        browser = await launchChrome(findChrome(), [
            '--kiosk', '--no-first-run', '--no-default-browser-check', '--disable-infobars', '--disable-features=Translate',
            '--hide-scrollbars', '--force-color-profile=srgb', ...position,
            `data:text/html,<style>html{background:${encodeURIComponent(PAGE_BG)};cursor:none}</style>`,
        ], join(work, 'profile'))
        const { targetInfos } = await browser.send('Target.getTargets')
        const target = targetInfos.find(t => t.type === 'page')
        const { sessionId } = await browser.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
        const send = (method, params) => browser.send(method, params, sessionId)
        await send('Page.enable')
        await send('Runtime.enable')
        await send('Page.addScriptToEvaluateOnNewDocument', { source: injectCss(pageCss(Number(option('shadows', 0)))) })
        const evaluate = async (expression, awaitPromise = false) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise })).result.value
        await sleep(1500)

        // The display as the browser sees it, and its refresh rate (animation frames over a second)
        const view = await evaluate(`({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })`)
        const measured = await evaluate(`new Promise(r => { let n = 0; const t0 = performance.now(); const tick = t => t - t0 < 1000 ? (n++, requestAnimationFrame(tick)) : r(n); requestAnimationFrame(tick) })`, true)
        const fps = Number(option('fps', [60, 75, 90, 100, 120, 144, 165, 180, 240].reduce((a, b) => Math.abs(b - measured) < Math.abs(a - measured) ? b : a)))
        const out = resolve(option('out', join(ROOT, 'recordings', `analysis-capture-${H}p${fps}.mp4`)))
        console.log(`Filming ${page.url} on display ${DISPLAY}: ${view.w}×${view.h} at ${view.dpr}× (${Math.round(view.w * view.dpr)}×${Math.round(view.h * view.dpr)} pixels), ${fps} fps (measured ${measured} frames/s)`)

        // The capture starts on the blank page; once it's running, the tour loads
        const raw = join(work, MAC ? 'capture.mov' : 'capture.mkv')
        capture = startCapture(raw, fps)
        let captured = 0
        capture.stdout.on('data', d => { for (const m of String(d).matchAll(/out_time_us=(\d+)/g)) captured = Number(m[1]) / 1e6 })
        for (let i = 0; captured < 1; i++) {
            if (i > 200 || capture.exitCode !== null) throw new Error('the screen capture did not start')
            await sleep(50)
        }
        const startedAt = Date.now(), lead = captured
        await send('Page.navigate', { url: page.url })
        console.log('The tour is playing; the screen is being filmed…')

        // Until the tour has ended, then the hold
        let seen = false
        for (; ;) {
            await sleep(250)
            const active = await evaluate(RUN_ACTIVE).catch(() => false)
            if (active) seen = true
            else if (seen) break
            if (Date.now() - startedAt > 300_000) throw new Error('the tour did not end within 5 minutes')
        }
        await sleep(HOLD * 1000)
        const length = (Date.now() - startedAt) / 1000
        capture.stdin.end('q')
        await new Promise(r => capture.once('close', r))
        capture = null
        await browser.close()
        browser = null

        // Trimmed to the tour, 16:9 from the middle, downscaled, H.264
        console.log(`Filmed ${length.toFixed(1)} s; encoding…`)
        const crop = `crop='min(iw,ih*16/9)':'min(ih,iw*9/16)'`
        mkdirSync(dirname(out), { recursive: true })
        const encode = spawnSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(Math.max(0, lead - 0.05)), '-i', raw, '-t', String(length),
            '-vf', `${crop},scale=${W}:${H}:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
            ...(MAC ? ['-c:v', 'h264_videotoolbox', '-b:v', '40M', '-profile:v', 'high']
                : ['-c:v', 'h264_nvenc', '-preset', 'p7', '-tune', 'hq', '-rc', 'constqp', '-qp', '10', '-profile:v', 'high']),
            '-g', String(fps), '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
            '-movflags', '+faststart', out], { stdio: 'inherit' })
        if (encode.status !== 0) { keep = true; throw new Error(`encoding failed (${encode.error?.message ?? `exit ${encode.status}`}); the capture is kept: ${raw}`) }
        console.log(`Done: ${out} (${(statSync(out).size / 1e6).toFixed(0)} MB)`)
    } finally {
        if (capture) { capture.stdin.end('q'); await new Promise(r => capture.once('close', r)) }
        await browser?.close()
        page.close()
        if (!keep) try { rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) } catch { console.warn(`Couldn't delete ${work}`) }
    }
}

/** On Windows, Chrome's --window-position for display `index`, so --kiosk opens full screen there */
async function displayOrigin(index) {
    const r = spawnSync('powershell', ['-NoProfile', '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { "$($_.Bounds.X),$($_.Bounds.Y)" }'], { encoding: 'utf8' })
    const origins = r.stdout.trim().split(/\r?\n/).filter(Boolean)
    return origins[index] ? [`--window-position=${origins[index]}`] : []
}

main().then(() => process.exit(0), error => { console.error(error.message ?? error); process.exit(1) })
