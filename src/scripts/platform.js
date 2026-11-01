// The visitor's platform, for the Download page.
// Android's user agent also says Linux, so it's checked first. Anything unrecognized gets Windows.
// iOS users are intentionally sent to the macOS build, since iOS is not supported and macOS is the closest
// thing in the Apple ecosystem.
export const detectOS = () => {
    const ua = navigator.userAgent || navigator.platform || '';
    if (/Android/.test(ua)) return 'android';
    if (/Mac|iPhone|iPad|iPod/.test(ua) && !ua.includes('Windows')) return 'macos';
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
