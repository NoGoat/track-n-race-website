// What the two /analysis/ video tools share (record-analysis-video.mjs renders it frame by frame in a headless browser,
// capture-analysis-video.mjs films a real browser on the screen): the page as it's filmed, the site to load it from,
// ffmpeg, and a Chrome DevTools connection.
import { spawn, spawnSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The command line's `--name value` options and `--name` flags */
export function parseArgs(argv = process.argv.slice(2)) {
    return {
        flag: name => argv.includes(`--${name}`),
        option: (name, fallback) => {
            const i = argv.indexOf(`--${name}`)
            return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
        },
    }
}

/**
 * The page as it's filmed: without the site's header and footer, the window centred in the viewport (App.tsx sizes
 * it to clamp(640, viewport height − 88, 880) px tall), and the drop shadows at `shadows` × their opacity (the site's
 * values: analysis-app.css, analysis-tour.css, select.tsx, ColorPicker.tsx; on video even faint ones read as dark
 * halos). The window's 1px outline ring stays.
 */
export function pageCss(shadows) {
    const shade = alpha => `rgba(0, 0, 0, ${+(alpha * shadows).toFixed(3)})`
    return `
.navbar, .site-footer, astro-dev-toolbar { display: none !important; }
.tour-mode { display: none !important; }
html, body { overflow: hidden !important; scrollbar-width: none !important; }
.tour { padding: max(0px, calc((100vh - clamp(640px, 100vh - 88px, 880px)) / 2)) var(--gutter) 0 !important; }
.tnr-window { box-shadow: 0 40px 100px ${shade(0.65)}, 0 0 0 1px rgba(0, 0, 0, 0.6) !important; }
.tnr-window .tour-pane { box-shadow: 0 30px 80px ${shade(0.6)} !important; }
[class$="-menu"], [class*="-menu "] { box-shadow: 0 8px 32px ${shade(0.6)} !important; }
.w-color-chrome { --github-box-shadow: 0 8px 32px ${shade(0.6)} !important; }
.tour-tip { box-shadow: 0 6px 20px ${shade(0.45)} !important; }
`
}
/** A script that adds the CSS to every page as it loads */
export const injectCss = css =>
    `document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = ${JSON.stringify(css)}; document.head.append(style) })`

/** The page's background (base.css --bg), which the window fades in over */
export const PAGE_BG = '#09090b'

/** True while the tour runs: its click-to-skip overlay covers the window */
export const RUN_ACTIVE = `!!document.querySelector('.tour-frame [aria-hidden="true"].cursor-pointer')`

export function findFfmpeg(given) {
    if (given) return given
    if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0) return 'ffmpeg'
    // The binary bundled with Python's imageio-ffmpeg, if that's installed
    for (const python of ['python3', 'python', 'py']) {
        const r = spawnSync(python, ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' })
        if (r.status === 0 && r.stdout.trim()) return r.stdout.trim()
    }
    throw new Error('ffmpeg not found: install it (winget install ffmpeg / brew install ffmpeg) or pass --ffmpeg <path>')
}

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
    '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain',
    '.xml': 'application/xml', '.webm': 'video/webm', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json',
}

/**
 * The /analysis/ page to film: `url` as given, or the site built (unless `build` is false) and dist/ served as the
 * static site it is (folders answer with their index.html) on a free port. Returns the page's URL and a close().
 */
export async function analysisPage({ url, build = true }) {
    if (url) return { url, close() { } }
    if (build) {
        console.log('Building the site…')
        if (spawnSync('npx astro build', { cwd: ROOT, stdio: 'inherit', shell: true }).status !== 0) throw new Error('astro build failed')
    }
    const dist = join(ROOT, 'dist')
    const server = createServer((req, res) => {
        let path = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname))
        if (!path.startsWith(dist)) { res.writeHead(403).end(); return }
        if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html')
        if (!existsSync(path)) { res.writeHead(404).end(); return }
        res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' })
        createReadStream(path).pipe(res)
    })
    await new Promise(r => server.listen(0, '127.0.0.1', r))
    return { url: `http://127.0.0.1:${server.address().port}/analysis/`, close: () => server.close() }
}

/**
 * Starts a Chrome (`exe`) with its own `profile` and connects to it over the DevTools protocol. Returns the process,
 * send(method, params, sessionId), on(listener) for events (returns an off()), and close(), which waits for the browser
 * to exit and deletes the profile.
 */
export async function launchChrome(exe, args, profile, { onSpawn } = {}) {
    rmSync(profile, { recursive: true, force: true })
    mkdirSync(profile, { recursive: true })
    const chrome = spawn(exe, ['--remote-debugging-port=0', `--user-data-dir=${profile}`, ...args], { stdio: 'ignore' })
    onSpawn?.(chrome)
    // The browser writes the port it picked into its profile
    const portFile = join(profile, 'DevToolsActivePort')
    for (let i = 0; !existsSync(portFile) || !readFileSync(portFile, 'utf8').includes('\n'); i++) {
        if (i > 300) throw new Error(`${exe} did not start`)
        await new Promise(r => setTimeout(r, 50))
    }
    const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n')
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`)
    await new Promise((r, j) => { ws.addEventListener('open', r, { once: true }); ws.addEventListener('error', j, { once: true }) })

    let nextId = 1
    const pending = new Map(), listeners = new Set()
    ws.addEventListener('message', e => {
        const m = JSON.parse(e.data)
        if (m.id && pending.has(m.id)) {
            const { resolve, reject } = pending.get(m.id)
            pending.delete(m.id)
            m.error ? reject(new Error(`${m.error.message} (${m.error.code})`)) : resolve(m.result)
        } else if (m.method) for (const listener of listeners) listener(m)
    })
    return {
        chrome,
        send: (method, params = {}, sessionId) => new Promise((resolve, reject) => {
            const id = nextId++
            pending.set(id, { resolve, reject })
            ws.send(JSON.stringify({ id, method, params, sessionId }))
        }),
        on(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        async close() {
            ws.close()
            const exited = chrome.exitCode !== null ? Promise.resolve() : new Promise(r => chrome.once('exit', r))
            chrome.kill()
            await exited
            rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
        },
    }
}
