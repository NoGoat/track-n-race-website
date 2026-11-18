// Content-hashed URLs for the files in src/assets/. The build copies each one to /_astro/ with a hash of its content in
// the name (overview.webp → /_astro/overview.Bx7q2c1a.webp), so a changed file gets a new URL and public/_headers can
// cache every one of them forever. Files that need a fixed URL (og-image, licences, the manifest's icons, favicon.ico)
// stay in public/ instead.
// For Astro frontmatter only: the map lists every file, so importing it from a browser script would ship all of it.
// Browser code that needs a few URLs globs just those (components/analysis/lib.ts, video.ts).
const urls = import.meta.glob('/src/assets/**/*', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const warned = new Set<string>();

/**
 * The built URL of src/assets/<path>, e.g. asset('screenshots/qt/session.webp').
 * A file that isn't there yet (a screenshot still to capture, see the TODOs in data/screens.ts) doesn't stop the build:
 * it's named in the build output and the page gets an unhashed /assets/ path, which shows as a missing image.
 */
export function asset(path: string): string {
    const url = urls[`/src/assets/${path}`];
    if (url) return url;
    if (!warned.has(path)) {
        warned.add(path);
        console.warn(`[asset-url] No file at src/assets/${path}; the page links to /assets/${path}, which doesn't exist`);
    }
    return `/assets/${path}`;
}
