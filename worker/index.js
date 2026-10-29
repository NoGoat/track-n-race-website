// Track N Race site Worker. Everything is served from static assets except two paths, which wrangler.jsonc
// routes here first (assets.run_worker_first):
//
//   /download/<build>/<os>   Counts the download in Workers Analytics Engine, then redirects to the file on GitHub.
//                            Hits that don't look like a person clicking on our pages are labelled in blob6 (see
//                            botReason) and still redirected.
//   /download/release        Same, for the release page (what the Download buttons open without the modal).
//   /download                Also the release page, with or without the trailing slash.
//   /api/event               Counts a page event sent with navigator.sendBeacon (only the names listed below).
//
// Nothing identifying is stored: no IP, no cookies, no user agent, no network. Each data point is the build, platform,
// the page it came from and the visitor's country as Cloudflare reports it, plus the bot label, which is worked out
// from the request as it arrives.
//
// Count people only with WHERE blob6 = ''. Labels: verified-bot, bot-ua, datacenter, not-click. Rows written before
// the labels have "" or "bot".

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
    'android/android': 'Track-N-Race-Android.apk',
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

// Analytics Engine data point. blob1: what, blob2: platform, blob3: page, blob4: country, blob5: version,
// blob6: the bot label (botReason) or "". index1 (the sampling key) is the "what". Writes never block or break the response.
const record = (env, request, url, what, platform, flag = '') => {
    env.DOWNLOADS?.writeDataPoint({
        indexes: [what],
        blobs: [what, platform, sourcePage(request, url), request.cf?.country ?? '', env.VERSION, flag],
        doubles: [1],
    });
};

// Tools, crawlers and link previewers that name themselves in their user agent. Browsers never contain these words.
// "bot" counts only as the end of a name ("Googlebot/2.1", "Slackbot-LinkExpanding"), so phones like the Cubot
// brand don't match.
const BOT_UA = /bot(?:[\/;)_-]|$)|crawl|spider|slurp|archiver|scan|monitor|preview|headless|phantomjs|puppeteer|playwright|selenium|curl|wget|httpie|python|aiohttp|httpx|scrapy|go-http-client|java\/|okhttp|axios|node-fetch|undici|libwww|lwp-|facebookexternalhit|whatsapp|embedly|skypeuripreview/i;

// Cloud and hosting networks (autonomous system numbers). Scrapers and scanners run there; people rarely browse from
// them, though some VPNs exit through them. Not Cloudflare's own 13335, which is also the 1.1.1.1 WARP app.
const HOSTING_ASNS = new Set([
    16509, 14618,           // Amazon Web Services
    15169, 396982,          // Google, Google Cloud
    8075,                   // Microsoft Azure
    31898,                  // Oracle Cloud
    45102, 132203,          // Alibaba Cloud, Tencent Cloud
    14061,                  // DigitalOcean
    24940,                  // Hetzner
    16276,                  // OVHcloud
    63949,                  // Akamai Linode
    20473,                  // Vultr
    12876,                  // Scaleway
    51167,                  // Contabo
]);

// Whether a /download/ hit is a person clicking a link on our pages. Crawlers and link scanners that ignore robots.txt
// fetch download URLs without a Referer or Sec-Fetch headers.
// Browsers that send Sec-Fetch-* must mark it a same-origin user click; older ones without them need our Referer.
const isHumanClick = (request, url) => {
    const site = request.headers.get('Sec-Fetch-Site');
    if (site === null) return sourcePage(request, url) !== '';
    return site === 'same-origin' && request.headers.get('Sec-Fetch-User') === '?1';
};

// Why a /download/ hit doesn't look like a person, or "" when it does. The first that applies is recorded.
const botReason = (request, url) => {
    // Cloudflare's list of verified bots (search engines, uptime monitors, ...). Workers only see it directly with
    // Enterprise Bot Management, so a Transform Rule passes it in (dashboard: Rules > Transform Rules > Request Header
    // Transform Rules): when starts_with(http.request.uri.path, "/download"), set dynamic X-Verified-Bot to
    // cf.client.bot. It runs before the Worker on every /download request and overwrites whatever the client sent.
    if (request.headers.get('X-Verified-Bot') === 'true') return 'verified-bot';
    const ua = request.headers.get('User-Agent') ?? '';
    if (!ua || BOT_UA.test(ua)) return 'bot-ua';
    if (HOSTING_ASNS.has(request.cf?.asn)) return 'datacenter';
    if (!isHumanClick(request, url)) return 'not-click';
    return '';
};

const noStore = { 'Cache-Control': 'no-store' };

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname.replace(/\/+$/, '');

        if (path === '/download' || path.startsWith('/download/')) {
            // Bare /download (with or without the trailing slash) is the release page, like /download/release
            const slug = path === '/download' ? 'release' : path.slice('/download/'.length).toLowerCase();
            // Bots still get redirected, and are recorded with their label so the filter can be checked
            const flag = botReason(request, url);

            let target;
            if (slug === 'release') {
                record(env, request, url, 'release', '', flag);
                target = `${RELEASE}/tag/${env.VERSION}`;
            } else if (FILES[slug]) {
                const [build, platform] = slug.split('/');
                record(env, request, url, build, platform, flag);
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
