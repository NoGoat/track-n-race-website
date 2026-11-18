// The visitor's platform, for the Download page.
// Android's user agent also says Linux, so it's checked first. Anything unrecognized gets Windows.
// iOS and iPadOS have no build, so they get null: the Download page preselects nothing and says so instead
// (see appleMobileOS below).
export const detectOS = () => {
    if (appleMobileOS()) return null;
    const ua = navigator.userAgent || navigator.platform || '';
    if (/Android/.test(ua)) return 'android';
    if (/Mac/.test(ua) && !ua.includes('Windows')) return 'macos';
    if (/Linux/.test(ua)) return 'linux';
    return 'windows';
};

// 'iOS' on an iPhone or iPod, 'iPadOS' on an iPad, null otherwise. iPadOS's Safari asks for the desktop site and
// says Macintosh, so a touch screen gives it away.
export const appleMobileOS = () => {
    const ua = navigator.userAgent || '';
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPadOS';
    if (/iPhone|iPod/.test(ua)) return 'iOS';
    return null;
};

export const osLabels = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android' };
