// The Setup questionnaire's logic, shared by scripts/setup.js (in the browser) and the pages built for no
// JavaScript (pages/no-js/setup/), so both show the same setup for the same answers.
// The answers, and what they add up to (derive), decide which blocks show. A block's data-when lists the conditions
// it needs, all of them: "view=computer,both platform=pc" shows when view is computer or both and platform is pc;
// "game=*" when game is answered. data-fill elements take their text from the answers (fillsFor).
export const QUESTIONS = ['platform', 'game', 'view', 'host', 'os'] as const;
export type Answers = Partial<Record<(typeof QUESTIONS)[number], string>>;
export type SetupState = Record<string, string | undefined>;

const GAME_NAMES: Record<string, string> = { f124: 'F1 24', f125: 'F1 25', f126: 'F1 25 + 2026 Season Pack' };
const FORMATS: Record<string, string> = { f124: '2024', f125: '2025', f126: '2026' };
const PLATFORM_NAMES: Record<string, string> = { pc: 'PC', console: 'console' };
const OS_NAMES: Record<string, string> = { windows: 'your Windows PC', macos: 'your Mac', linux: 'your Linux PC' };
// The device the game sends to, as the IP step names it
const IP_DEVICES: Record<string, string> = { windows: 'your Windows PC', macos: 'your Mac', linux: 'your Linux PC', android: 'your phone' };
const IP_OWNERS: Record<string, string> = { windows: "your PC's", macos: "your Mac's", linux: "your PC's", android: "your phone's" };
// What the game's IP field shows until a real address is entered
const IP_PLACEHOLDERS: Record<string, string> = { windows: "Your PC's IP", macos: "Your Mac's IP", linux: "Your PC's IP", android: "Your phone's IP" };

// Answers plus what follows from them. Questions that don't apply are dropped, so a stale answer (say the PC host
// kept after switching to PlayStation) never shows through.
export const derive = (a: Answers): SetupState => {
    const s: SetupState = { platform: a.platform, game: a.game, view: a.view };
    if (!s.platform || !s.game || !s.view) return s;
    if (s.view !== 'android') {
        // A console can't run Track N Race, so it always sends to another computer
        s.host = s.platform === 'pc' ? a.host : 'other';
        s.os = a.os;
        if (!s.host || !s.os) return s;
    }
    s.link = ({ computer: 'desktop', android: 'direct', both: 'paired' } as Record<string, string>)[s.view];
    // The Native (Qt) app is built for Windows and Linux only; a Mac runs the Electron app
    if (s.view !== 'android') s.native = s.os === 'macos' ? 'no' : 'yes';
    s.ip = s.view === 'android' ? 'android' : s.host === 'same' ? 'loopback' : s.os;
    s.complete = 'yes';
    return s;
};

export const matches = (when: string, state: SetupState) => when.trim().split(/\s+/).every(cond => {
    const [key, values] = cond.split('=');
    const value = state[key];
    return value !== undefined && (values === '*' || values.split(',').includes(value));
});

// The text each data-fill element takes
export const fillsFor = (state: SetupState): Record<string, string> => ({
    'game-name': GAME_NAMES[state.game ?? ''] ?? 'the game',
    'platform-name': PLATFORM_NAMES[state.platform ?? ''] ?? 'your device',
    'format': FORMATS[state.game ?? ''] ?? '',
    'host-name': state.host === 'same' ? (state.os === 'macos' ? 'this Mac' : 'this PC') : OS_NAMES[state.os ?? ''] ?? 'your computer',
    'ip-device': IP_DEVICES[state.ip ?? ''] ?? 'the device',
    'ip-owner': IP_OWNERS[state.ip ?? ''] ?? 'its',
    'ip-target': state.ip === 'loopback' ? '127.0.0.1' : IP_PLACEHOLDERS[state.ip ?? ''] ?? '',
});
