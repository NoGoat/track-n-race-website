// The pages that have a version built to work without JavaScript, under /no-js/ (pages/no-js/). Each page passes its
// version to layouts/Base.astro, whose noscript refresh opens it, and on /no-js/ pages the header and footer link
// to the versions instead of the pages. robots.txt keeps crawlers out of /no-js/.
export const nojsPages: Record<string, string> = {
    '/': '/no-js/',
    '/gallery/': '/no-js/gallery/',
    '/electron-vs-qt/': '/no-js/electron-vs-qt/',
    '/download/': '/no-js/download/',
    '/setup/': '/no-js/setup/',
    '/credits/': '/no-js/credits/',
};

export const isNojsPath = (path: string) => path.startsWith('/no-js/');

// A link for the current page's mode: on /no-js/ pages, the version without JavaScript where there is one
export const linkFor = (href: string, path: string) => isNojsPath(path) ? nojsPages[href] ?? href : href;

// Whether a nav link is the current page. /no-js/setup/ has a page per answer, so it counts everything under it.
export const isCurrent = (href: string, path: string) => {
    const target = linkFor(href, path);
    return path === target || (target !== '/no-js/' && isNojsPath(target) && path.startsWith(target));
};
