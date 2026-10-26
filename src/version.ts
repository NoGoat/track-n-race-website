// The current release. It lives in wrangler.jsonc's "vars", where the Worker reads it for /download/ redirects and
// their counts, so a release is bumped in that one place.
import wrangler from '../wrangler.jsonc?raw';

// JSONC: drop comments (but not "//" inside strings) and trailing commas
const config = JSON.parse(wrangler
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_: string, string?: string) => string ?? '')
    .replace(/,(\s*[}\]])/g, '$1'));

export const VERSION: string = config.vars?.VERSION;
if (!/^\d+\.\d+\.\d+$/.test(VERSION ?? '')) throw new Error('wrangler.jsonc needs vars.VERSION, e.g. "1.6.2"');
