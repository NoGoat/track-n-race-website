// Normalise "/setup", "/setup/" and "/setup/index.html" to "/setup"
export const normalisePath = path => path.toLowerCase()
    .replace(/(index)?(\.html)?$/, '')
    .replace(/\/+$/, '');
export const currentPath = normalisePath(window.location.pathname);
