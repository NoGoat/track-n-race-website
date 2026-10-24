// Track N Race site Worker. Everything is served from static assets except two paths, which wrangler.jsonc
// routes here first (assets.run_worker_first):
//
//   /download/<build>/<os>   Counts the download in Workers Analytics Engine, then redirects to the file on GitHub.
//   /download/release        Same, for the release page (what the Download buttons open without the modal).
//   /api/event               Counts a page event sent with navigator.sendBeacon (only the names listed below).
//
// Nothing identifying is stored: no IP, no cookies, no user agent. Each data point is the build, platform, the
// page it came from and the visitor's country as Cloudflare reports it.

// The current release comes from env.VERSION ("vars" in wrangler.jsonc), which the pages are built from too
const RELEASE = `https://github.com/NoGoat/Track-N-Race/releases`;

// Only these slugs redirect, so /download/ can't be used to bounce visitors to arbitrary URLs
const FILES = {
    'electron/windows': 'Track-N-Race-Electron-Windows.exe',
    'electron/macos': 'Track-N-Race-Electron-MacOS.dmg',
    'electron/linux': 'Track-N-Race-Electron-Linux.AppImage',
    'qt/windows': 'Track-N-Race-Qt-Windows.exe',
    'qt/linux': 'Track-N-Race-Qt-Linux.AppImage',
    'minimal/windows': 'Track-N-Race-Minimal-Windows.zip',
    'minimal/macos': 'Track-N-Race-Minimal-MacOS.dmg',
    'minimal/linux': 'Track-N-Race-Minimal-Linux.AppImage',
};

const EVENTS = new Set(['download_modal_open']);

// The page a click came from, as a path ("/", "/electron-vs-qt/"), or "" when the referrer is missing or another site
const sourcePage = (request, url) => {
    try {
        const ref = new URL(request.headers.get('Referer'));
        return ref.host === url.host ? ref.pathname : '';
    } catch {
        return '';
    }
};

// Analytics Engine data point. blob1: what, blob2: platform, blob3: page, blob4: country, blob5: version.
// index1 (the sampling key) is the "what". Writes never block or break the response.
const record = (env, request, url, what, platform) => {
    env.DOWNLOADS?.writeDataPoint({
        indexes: [what],
        blobs: [what, platform, sourcePage(request, url), request.cf?.country ?? '', env.VERSION],
        doubles: [1],
    });
};

const noStore = { 'Cache-Control': 'no-store' };

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname.replace(/\/+$/, '');

        if (path.startsWith('/download/')) {
            const slug = path.slice('/download/'.length).toLowerCase();

            let target;
            if (slug === 'release') {
                record(env, request, url, 'release', '');
                target = `${RELEASE}/tag/${env.VERSION}`;
            } else if (FILES[slug]) {
                const [build, platform] = slug.split('/');
                record(env, request, url, build, platform);
                target = `${RELEASE}/download/${env.VERSION}/${FILES[slug]}`;
            } else {
                // Not a known build: the assets layer answers with the site's 404 page
                return env.ASSETS.fetch(request);
            }

            // 302 and no-store, so every click reaches the Worker and is counted
            return new Response(null, { status: 302, headers: { Location: target, ...noStore } });
        }

        if (path === '/api/event') {
            // Beacons come from our own pages only; anything else is ignored (still 204, nothing to learn from it)
            const sameSite = request.headers.get('Sec-Fetch-Site');
            const name = url.searchParams.get('name');
            if (request.method === 'POST' && (sameSite === 'same-origin' || sameSite === null) && EVENTS.has(name)) {
                record(env, request, url, name, url.searchParams.get('os') ?? '');
            }
            return new Response(null, { status: 204, headers: noStore });
        }

        return env.ASSETS.fetch(request);
    },
};
