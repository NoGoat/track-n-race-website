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
