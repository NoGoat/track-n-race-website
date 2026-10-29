// The visitor's platform, for the download modal and the Download page.
// Android's user agent also says Linux, so it's checked first. null when it's none of the four (iOS, ...).
export const detectOS = () => {
    const ua = navigator.userAgent || navigator.platform || '';
    if (/Android/.test(ua)) return 'android';
    if (/Mac|iPhone|iPad|iPod/.test(ua) && !ua.includes('Windows')) return 'macos';
    if (/Linux/.test(ua)) return 'linux';
    if (/Windows/.test(ua)) return 'windows';
    return null;
};

export const osLabels = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android' };

// Build links ship with only a data-build slug, so scrapers that read the HTML find no download URLs to hit
// (worker/index.js counts the hits). This gives them their /download/<slug> href.
export const fillBuildLinks = (root) => {
    root.querySelectorAll('a[data-build]:not([href])').forEach(link => {
        link.href = `/download/${link.dataset.build}`;
        link.rel = 'nofollow';
    });
};
