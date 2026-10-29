// The pages that have a version built to work without JavaScript, under /no-js/ (pages/no-js/). Each page passes its
// version to layouts/Base.astro, whose noscript refresh opens it, and on /no-js/ pages the header and footer link
// to the versions instead of the pages. Crawlers are allowed in no-js pages however they are blocked from indexing it.
export const nojsPages: Record<string, string> = {
    '/': '/no-js/',
    '/gallery/': '/no-js/gallery/',
    '/download/': '/no-js/download/',
    '/setup/': '/no-js/setup/',
    '/privacy/': '/no-js/privacy/',
};

// Pages that need JavaScript and have no version without it: their noscript refresh sends browsers to the home
// page's version, and /no-js/ pages leave out links to them.
export const jsOnlyPages = new Set(['/electron-vs-qt/', '/tnrd/', '/credits/']);
export const NOJS_HOME = nojsPages['/'];

export const isNojsPath = (path: string) => path.startsWith('/no-js/');

// A link for the current page's mode: on /no-js/ pages, the version without JavaScript where there is one
export const linkFor = (href: string, path: string) => isNojsPath(path) ? nojsPages[href] ?? href : href;

// Whether a link belongs on the current page: on /no-js/ pages, not when it only leads back home
export const showsOn = (href: string, path: string) => !isNojsPath(path) || !jsOnlyPages.has(href);

// Whether a nav link is the current page. /no-js/download/ has a page per platform, so it counts everything under it.
export const isCurrent = (href: string, path: string) => {
    const target = linkFor(href, path);
    return path === target || (target !== '/no-js/' && isNojsPath(target) && path.startsWith(target));
};
