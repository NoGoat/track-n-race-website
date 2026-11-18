// Builds the site into dist/ as plain static files, which wrangler.jsonc serves as Cloudflare static assets.
// No server rendering: only /download/* and /api/* reach the Worker (worker/index.js).
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    // React and Tailwind are only for the Analysis tour (/analysis/): a copy of the app's React screen, so it is
    // built from the app's own components, classes and react-select. No other page loads either.
    integrations: [react()],
    vite: {
        plugins: [tailwindcss()],
        build: {
            // Every file in src/assets/ is emitted to /_astro/ with a content hash in its name (src/asset-url.ts).
            // Vite would otherwise turn files under 4 KB into data: URIs, which the CSP below blocks for fonts.
            assetsInlineLimit: 0,
        },
    },
    site: 'https://track-n-race.com',
    // Every page is a folder with an index.html ("/setup/"), matching the URLs in the links and sitemap
    trailingSlash: 'always',
    // Keep the HTML as written. Compression drops line breaks next to inline tags, which glues words together
    // ("<strong>lap table</strong>" at a line end followed by "lists" became "lap tablelists").
    // We have compression at the Cloudflare level, so, disabling compression here is a non issue.
    compressHTML: false,
    build: {
        format: 'directory',
    },
    // No Markdown or <Code> blocks on the site, so no syntax highlighting. Turning Shiki off also silences
    // Astro's warning that Shiki's inline styles clash with the CSP below.
    markdown: {
        syntaxHighlight: false,
    },
    // Links marked data-astro-prefetch load their page in the background on hover or tap. Opt-in, not prefetchAll,
    // so /download/ links (counted by the Worker) are never fetched by a hover.
    prefetch: {
        defaultStrategy: 'hover',
    },
    // Content Security Policy, as a <meta> tag on every page. Astro hashes the scripts it bundles or inlines (page
    // scripts, the React island's loader) into script-src at build time, so no inline script runs unless the build
    // put it there. Not checked in `astro dev`: test with a build.
    // Directives a <meta> tag can't carry (frame-ancestors) are sent as a header from public/_headers.
    security: {
        csp: {
            directives: [
                "default-src 'self'",
                // data: for the checkbox tick drawn in styles/fixes.css
                "img-src 'self' data:",
                "font-src 'self'",
                // The Analysis tour's recording (src/components/analysis/video.ts)
                "media-src 'self'",
                // Same-site fetches only: tour data, licences, the .tnrd diagram, /api/contact
                "connect-src 'self'",
                // The Turnstile widget on the Privacy Policy runs in Cloudflare's iframe (scripts/contact.js)
                "frame-src https://challenges.cloudflare.com",
                "object-src 'none'",
                "base-uri 'self'",
                "form-action 'self'",
            ],
            scriptDirective: {
                // Turnstile's script, loaded on demand by scripts/contact.js
                resources: ["'self'", 'https://challenges.cloudflare.com'],
                // The one is:inline script Astro doesn't hash: the no-js → js swap in layouts/Base.astro.
                // Change that line and this hash must change with it.
                hashes: ['sha256-e2g5HkZP+fghbsY1m7moq4GopOo7zRRaAHNyQ2Q7oSI='],
            },
            styleDirective: {
                // Inline styles stay allowed: style="" attributes (the build colours on the Download cards), the
                // <style> react-select injects on the Analysis tour, and the .tnrd SVG placed inline on the home page.
                // With 'unsafe-inline' here Astro emits no style hashes, as the CSP spec requires.
                resources: ["'self'", "'unsafe-inline'"],
            },
        },
    },
});
