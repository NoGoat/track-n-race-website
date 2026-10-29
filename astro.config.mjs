// Builds the site into dist/ as plain static files, which wrangler.jsonc serves as Cloudflare static assets.
// No server rendering: only /download/* and /api/* reach the Worker (worker/index.js).
import { defineConfig } from 'astro/config';
import stripOmitted from './integrations/strip-omitted.mjs';

export default defineConfig({
    site: 'https://track-n-race.com',
    // Every page is a folder with an index.html ("/setup/"), matching the URLs in the links and sitemap
    trailingSlash: 'always',
    // Keep the HTML as written. Compression drops line breaks next to inline tags, which glues words together
    // ("<strong>lap table</strong>" at a line end followed by "lists" became "lap tablelists").
    compressHTML: false,
    build: {
        format: 'directory',
    },
    // Links marked data-astro-prefetch load their page in the background on hover or tap. Opt-in, not prefetchAll,
    // so /download/ links (counted by the Worker) are never fetched by a hover.
    prefetch: {
        defaultStrategy: 'hover',
    },
    // Trims the Setup page's versions without JavaScript to their own steps once they're built
    integrations: [stripOmitted()],
});
