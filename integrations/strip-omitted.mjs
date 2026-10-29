// Build step for the Setup page's versions without JavaScript (pages/no-js/setup/): their result
// (components/SetupResult.astro) marks every block that doesn't apply to that page's answers with data-omit, and
// this removes those blocks from the built pages, so each one carries only its own steps. They're also hidden, so a
// page that skipped this step (astro dev) still shows the same.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TAG = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z][\w-]*)\b([^>]*)>/g;

// Cuts each element whose opening tag has data-omit, with everything inside it. Counts same-name tags to find its
// end; the markup is our own, so no attribute holds a ">".
export const stripOmitted = (html) => {
    const tag = new RegExp(TAG);
    let out = '';
    let kept = 0;
    let m;
    while ((m = tag.exec(html))) {
        if (m[0].startsWith('<!--') || m[1] || !/\sdata-omit\b/.test(m[3])) continue;
        const name = m[2].toLowerCase();
        const start = m.index;
        if (!VOID.has(name) && !m[3].endsWith('/')) {
            let depth = 1;
            let n;
            while (depth > 0 && (n = tag.exec(html))) {
                if (n[0].startsWith('<!--') || n[2].toLowerCase() !== name) continue;
                depth += n[1] ? -1 : 1;
            }
            if (depth > 0) throw new Error(`strip-omitted: no closing </${name}>`);
        }
        out += html.slice(kept, start);
        kept = tag.lastIndex;
    }
    return out + html.slice(kept);
};

const htmlFiles = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(entry => {
        const path = join(dir, entry.name);
        return entry.isDirectory() ? htmlFiles(path) : entry.name.endsWith('.html') ? [path] : [];
    }));
    return files.flat();
};

export default function stripOmittedIntegration() {
    return {
        name: 'strip-omitted',
        hooks: {
            'astro:build:done': async ({ dir, logger }) => {
                const files = await htmlFiles(join(fileURLToPath(dir), 'no-js', 'setup'));
                let saved = 0;
                await Promise.all(files.map(async (file) => {
                    const html = await readFile(file, 'utf8');
                    const stripped = stripOmitted(html);
                    saved += html.length - stripped.length;
                    if (stripped !== html) await writeFile(file, stripped);
                }));
                logger.info(`${files.length} Setup pages without JavaScript, ${Math.round(saved / 1024)} KB of blocks that don't apply removed`);
            },
        },
    };
}
