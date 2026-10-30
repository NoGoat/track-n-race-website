// The current release and the contact challenge's Turnstile site key, from wrangler.jsonc's "vars". The Worker reads
// the release there too, for /download/ redirects and their counts, so a release is bumped in that one place.
import wrangler from '../wrangler.jsonc?raw';

// JSONC: drop comments (but not "//" inside strings) and trailing commas
const config = JSON.parse(wrangler
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_: string, string?: string) => string ?? '')
    .replace(/,(\s*[}\]])/g, '$1'));

export const VERSION: string = config.vars?.VERSION;
if (!/^\d+\.\d+\.\d+$/.test(VERSION ?? '')) throw new Error('wrangler.jsonc needs vars.VERSION, e.g. "1.6.2"');

export const TURNSTILE_SITE_KEY: string = config.vars?.TURNSTILE_SITE_KEY;
if (!TURNSTILE_SITE_KEY) throw new Error('wrangler.jsonc needs vars.TURNSTILE_SITE_KEY');
