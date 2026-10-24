// Copies the shared blocks in partials/*.html (header, footer, dialogs, ...) into every page, so they are written once
// and every page still ships as complete static HTML. A page opts in with a pair of markers:
//
//   <!-- partial:header -->
//   ...replaced on every run, don't edit here...
//   <!-- /partial:header -->
//
// The partial is re-indented to the opening marker's indentation, and the link to the page itself is marked:
// header nav buttons get the "active" class, and header and footer links get aria-current="page".
//
// Partials can use the Worker's environment variables ("vars" in wrangler.jsonc) as {{NAME}}, e.g. {{VERSION}}, so
// the release version is set in one place. Pages' JSON-LD "softwareVersion" is kept in step with VERSION too.
//
//   node scripts/partials.mjs           Update pages in place (wrangler runs this before dev and deploy)
//   node scripts/partials.mjs --check   Exit 1 if any page is out of date, without writing

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PARTIALS = join(ROOT, 'partials');
const SKIP = new Set(['.git', '.wrangler', 'node_modules', 'partials', 'scripts', 'worker', 'assets']);
const check = process.argv.includes('--check');

// The Worker's vars from wrangler.jsonc. JSONC: drop comments (but not "//" inside strings) and trailing commas.
const config = JSON.parse(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8')
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, string) => string ?? '')
    .replace(/,(\s*[}\]])/g, '$1'));
const VARS = config.vars ?? {};
if (!/^\d+\.\d+\.\d+$/.test(VARS.VERSION ?? '')) throw new Error('wrangler.jsonc needs vars.VERSION, e.g. "1.6.2"');

const MARKER = /^([ \t]*)<!-- partial:([\w-]+) -->\r?\n[\s\S]*?^[ \t]*<!-- \/partial:\2 -->/gm;

const pages = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : pages(join(dir, entry.name));
    return entry.name.endsWith('.html') ? [join(dir, entry.name)] : [];
});

// The URL a page is served at ("/", "/setup/"), or null for pages that aren't in the nav (404.html)
const urlOf = (file) => {
    const path = relative(ROOT, file).split(sep).join('/');
    if (path === 'index.html') return '/';
    if (path.endsWith('/index.html')) return `/${path.slice(0, -'index.html'.length)}`;
    return null;
};

const partials = new Map();
const partial = (name) => {
    if (!partials.has(name)) {
        const file = join(PARTIALS, `${name}.html`);
        if (!existsSync(file)) throw new Error(`partials/${name}.html does not exist`);
        const html = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trimEnd().replace(/\{\{(\w+)\}\}/g, (_, key) => {
            if (!(key in VARS)) throw new Error(`partials/${name}.html uses {{${key}}}, which wrangler.jsonc vars doesn't set`);
            return VARS[key];
        });
        partials.set(name, html);
    }
    return partials.get(name);
};

const markCurrent = (html, url) => {
    if (!url) return html;
    return html
        .replaceAll(`<a href="${url}" class="nav-btn">`, `<a href="${url}" class="nav-btn active" aria-current="page">`)
        .replaceAll(`<li><a href="${url}">`, `<li><a href="${url}" aria-current="page">`);
};

let stale = 0;
for (const file of pages(ROOT)) {
    const source = readFileSync(file, 'utf8');
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    const url = urlOf(file);

    const output = source.replace(/("softwareVersion":\s*)"[^"]*"/g, `$1"${VARS.VERSION}"`).replace(MARKER, (_, indent, name) => {
        const body = markCurrent(partial(name), url)
            .split('\n')
            .map(line => (line ? indent + line : line))
            .join(eol);
        return `${indent}<!-- partial:${name} -->${eol}${body}${eol}${indent}<!-- /partial:${name} -->`;
    });

    if (output === source) continue;
    stale++;
    const name = relative(ROOT, file);
    if (check) {
        console.error(`out of date: ${name}`);
    } else {
        writeFileSync(file, output);
        console.log(`updated: ${name}`);
    }
}

if (check && stale) {
    console.error('Run "npm run partials" to update.');
    process.exit(1);
}
