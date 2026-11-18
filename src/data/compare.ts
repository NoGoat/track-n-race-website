// The Frontends page (/frontends/): the four builds, their memory, their features, the screens it compares and its
// questions. The Download page's cards (data/downloads.ts) say the same things at more length; keep them in step.
import { platformIcons } from './icons';
import { groups } from './gallery';

export type Build = 'electron' | 'qt' | 'minimal' | 'android';
export type ScreenUi = 'electron' | 'qt' | 'android';

export const builds: Build[] = ['electron', 'qt', 'minimal', 'android'];
/** Long names, for the lineup and the chart's legend */
export const buildNames: Record<Build, string> = { electron: 'Electron', qt: 'Native', minimal: 'Minimal Recorder', android: 'Android' };
/** Table column headers */
export const shortNames: Record<Build, string> = { ...buildNames, minimal: 'Minimal' };

export const platforms = {
    windows: { name: 'Windows', icon: platformIcons.windows },
    macos: { name: 'macOS', icon: platformIcons.apple },
    linux: { name: 'Linux', icon: platformIcons.tux },
    android: { name: 'Android', icon: platformIcons.android },
} as const;
export type Platform = keyof typeof platforms;

/** The lineup at the top: one column per build */
export const lineup: Record<Build, { title: [string, string]; stack: string; desc: string; ram: number; runsOn: Platform[] }> = {
    electron: {
        title: ['Electron', 'Frontend'], stack: 'Electron, React', ram: 714, runsOn: ['windows', 'macos', 'linux'],
        desc: 'The full app with a modern, web-style look. The same app on Windows, macOS and Linux.',
    },
    qt: {
        title: ['Native', 'Frontend'], stack: 'Qt', ram: 444, runsOn: ['windows', 'linux'],
        desc: 'Every screen Electron has, built with Qt. Feels like a desktop tool, in a good deal less memory.',
    },
    minimal: {
        title: ['Minimal', 'Recorder'], stack: 'Win32 · Swift · Qt', ram: 84, runsOn: ['windows', 'macos', 'linux'],
        desc: 'Records your sessions with no screens of its own. Open the recordings in Electron or Native. Ideal for low overhead racing.',
    },
    android: {
        title: ['Android', 'App'], stack: 'Phones and tablets', ram: 159, runsOn: ['android'],
        desc: 'The full app on Android. Takes telemetry straight from the game, or mirrors the desktop app.',
    },
};

/** RAM in MB per scenario, in build order; null where the build doesn't do it (the Minimal Recorder can't review).
 *  Android is PSS on a Samsung Galaxy M12 (docs/ram-reports/Android-frontend-RAM.pdf, 18 Nov 2026); its review peak
 *  is the All Laps tour, not the brief spike while the recording opens. */
export const memory: { label: string; when: string; mb: (number | null)[] }[] = [
    { label: 'Idle', when: 'Before a session', mb: [282, 187, 7, 61] },
    { label: 'End of a live race', when: 'While driving', mb: [714, 444, 84, 159] },
    { label: 'Peak during a live race', when: 'While driving', mb: [748, 463, 85, 175] },
    { label: 'Reviewing a race', when: 'All Laps, after', mb: [752, 570, null, 399] },
    { label: 'Peak while reviewing', when: 'All Laps, after', mb: [1115, 712, null, 549] },
];

/** Feature rows per group, in build order. true / false, or null where it doesn't apply (shown as a dash) */
export const features: { group: string; rows: [string, (boolean | null)[]][] }[] = [
    { group: 'Recording', rows: [
        ['Records sessions', [true, true, true, true]],
        ['Opens recordings to review', [true, true, false, true]],
        ['UDP forwarding to other apps', [true, true, true, true]],
    ] },
    { group: 'While driving', rows: [
        ['Live telemetry', [true, true, false, true]],
    ] },
    { group: 'Analysis', rows: [
        ['Lap analysis', [true, true, false, true]],
        ['Trends across the race', [true, true, false, true]],
    ] },
    { group: 'Layout', rows: [
        ['Layout editor', [true, true, false, true]],
        ['Data tables instead of graphs', [true, true, false, true]],
    ] },
    { group: 'Connections', rows: [
        ['Takes telemetry straight from the game', [true, true, true, true]],
        ['Mirrors the desktop app (Paired mode)', [null, null, null, true]],
    ] },
];

export const faq: [string, string][] = [
    ['Which ones run on a Mac?', 'Electron and the Minimal Recorder. Native has no macOS build, so on a Mac the full app is Electron.'],
    ['Is there an iPhone or iPad app?', 'No. Android is the only mobile app; iOS isn\'t supported.'],
    ['Do I need a computer to use the Android app?', 'No. In Direct mode the game sends telemetry straight to your phone or tablet. Paired mode is there if you also want it to mirror the desktop app.'],
    ['When should I use the Minimal Recorder?', 'When your PC struggles to run the game and a full app together. Record while you drive, then open the recordings in Electron or Native afterwards.'],
    ['Electron or Native: which should I start with?', 'Electron, for most people. Pick Native if you\'d rather have a lighter, more desktop-style app on Windows or Linux. Both have every screen.'],
    ['Can I send telemetry to other apps too?', 'Yes. Every build, Android included, can forward the game\'s UDP data to other apps.'],
    ['Does the Android app have everything the desktop app has?', 'Yes. It has every screen the desktop app has, including the layout editor, data tables and driver lap times, plus UDP forwarding and a port you can change.'],
    ['Why does Track N Race exist on both Electron and Qt?', 'Track N Race started out on Electron. I then built the Qt version because it was fun. Now they both exist.'],
    ['Will one of the platforms be discontinued?', 'I enjoy building for both so both will stay for the forseeable future.'],
];

/** Screen by screen: the Gallery's areas, without Misc */
export const screenGroups = groups
    .map(group => ({ title: group.title, screens: group.screens.filter(file => file !== 'misc') }))
    .filter(group => group.screens.length);
export const order = screenGroups.flatMap(group => group.screens);
