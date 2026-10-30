import { platformIcons } from './icons';

// Step 01 on the Download page (scripts/download-page.js)
export const platformQuestion = 'What are you downloading for?';
export const platforms = [
    { os: 'windows', label: 'Windows', desc: 'Electron, Native or Minimal', icon: platformIcons.windows },
    { os: 'macos', label: 'macOS', desc: 'Electron or Minimal', icon: platformIcons.apple },
    { os: 'linux', label: 'Linux', desc: 'Electron, Native or Minimal', icon: platformIcons.tux },
    { os: 'android', label: 'Android', desc: 'The full app, as an .apk', icon: platformIcons.phone },
];

// The Download page's guides, one per platform (pages/download.astro). Their numbers come from the Frontends page's
// table. A value given per OS shows only on that platform.
export type PerOs = string | Record<string, string>;
export interface Build {
    slug: string;
    name: string;
    stack?: PerOs;
    desc: string;
    pros: string[];
    cons: string[];
    specs: [string, PerOs][];
    // The download button's label, when "Download <name>" doesn't read well
    cta?: string;
    // A callout under the name, for the one thing to know before picking it:
    // pick (green) the default choice, alt (neutral) the fallback, warn (amber) a catch
    badge?: { text: string; tone: 'pick' | 'alt' | 'warn' };
}
export interface Dive {
    for: string[];
    title: string;
    intro: string;
    builds: Build[];
    advice?: string;
    // The footnote on where the RAM figures come from, for guides that quote them
    ramNote?: boolean;
}

const winLinuxFile = (windows: string, linux: string) => ({ windows, linux });

export const dives: Dive[] = [
    {
        for: ['windows', 'linux'],
        title: 'Electron, Native or Minimal?',
        intro: 'Electron and Native are both the full app, with the same screens: live telemetry, lap analysis, the layout editor and playback. The difference is how they feel, how much memory they use, and where else they run. Both record your sessions too; the Minimal Recorder does only that, in as little memory as possible.',
        builds: [
            {
                slug: 'electron',
                name: 'Electron',
                stack: 'Electron, React',
                badge: { text: 'The recommended choice for most users', tone: 'pick' },
                desc: 'The full app, and the same one on Windows, macOS and Linux.',
                pros: [
                    'Feels more modern, with a web-style look',
                    'The same app on every desktop, so it carries over if you also use a Mac',
                    'Every screen, recording, playback and UDP forwarding',
                ],
                cons: [
                    'Uses the most memory: about 270 MB more than Native at the end of a live race',
                ],
                specs: [
                    ['RAM, idle', '282 MB'],
                    ['RAM, end of a live race', '714 MB'],
                    ['RAM, peak reviewing', '1,115 MB'],
                    ['File', winLinuxFile('.exe', '.AppImage')],
                ],
            },
            {
                slug: 'qt',
                name: 'Native',
                stack: 'Qt',
                badge: { text: 'If your system can\'t handle Electron, download this', tone: 'alt' },
                desc: 'Every screen Electron has, built with Qt, in a good deal less memory.',
                pros: [
                    'Feels more analytical and native, like a desktop tool',
                    'Over a third less RAM in a live race: 444 MB against 714 MB',
                    'Leaves more memory for the game when both run on one PC',
                    'Every screen, recording, playback and UDP forwarding, like Electron',
                ],
                cons: [
                    'No macOS build: on a Mac you need Electron',
                ],
                specs: [
                    ['RAM, idle', '187 MB'],
                    ['RAM, end of a live race', '444 MB'],
                    ['RAM, peak reviewing', '712 MB'],
                    ['File', winLinuxFile('.exe', '.AppImage')],
                ],
            },
            {
                slug: 'minimal',
                name: 'Minimal Recorder',
                stack: { windows: 'Win32', linux: 'Qt' },
                badge: { text: 'Needs Electron or Native to view the recordings', tone: 'warn' },
                desc: 'Electron and Native both record sessions too. The Minimal Recorder does only that, for those who care about squeezing every last bit of resources while they play, and has no screens of its own to view them.',
                pros: [
                    'Built for maximum resource optimization, when your PC can\'t spare the memory for the game and a full app together',
                    '85 MB at its peak in a live race, against 463 MB for Native and 748 MB for Electron',
                    'Forwards UDP to other apps',
                ],
                cons: [
                    'No live telemetry, lap analysis or layout editor',
                ],
                specs: [
                    ['RAM, idle', '7 MB'],
                    ['RAM, end of a live race', '84 MB'],
                    ['RAM, peak reviewing', '\u2014'],
                    ['File', winLinuxFile('.zip', '.AppImage')],
                ],
            },
        ],
        ramNote: true,
    },
    {
        for: ['macos'],
        title: 'Electron or the Minimal Recorder?',
        intro: 'Native isn\'t available on macOS, so Electron is the full app here. The Minimal Recorder is a lighter companion to it, not a replacement.',
        builds: [
            {
                slug: 'electron',
                name: 'Electron',
                stack: 'Electron, React',
                desc: 'The full app: live telemetry, lap analysis, the layout editor and playback of your recordings.',
                pros: [
                    'Everything Track N Race does, on macOS',
                    'Opens the sessions the Minimal Recorder records',
                ],
                cons: [
                    'Up to 748 MB in a live race, running beside the game',
                ],
                specs: [
                    ['RAM, peak during a live race', '748 MB'],
                    ['File', '.dmg'],
                ],
            },
            {
                slug: 'minimal',
                name: 'Minimal Recorder',
                stack: 'Swift',
                badge: { text: 'Needs Electron to view the recordings', tone: 'warn' },
                desc: 'Electron records sessions too. The Minimal Recorder does only that, for those who care about squeezing every last bit of resources while they play, and has no screens of its own to view them.',
                pros: [
                    'Built for maximum resource optimization, when your Mac can\'t spare the memory for the game and Electron together',
                    '85 MB at its peak in a live race, against Electron\'s 748 MB',
                    'Forwards UDP to other apps',
                ],
                cons: [
                    'No live telemetry, lap analysis or layout editor',
                ],
                specs: [
                    ['RAM, peak during a live race', '85 MB'],
                    ['File', '.dmg'],
                ],
            },
        ],
        advice: 'Start with Electron. If your Mac struggles running it and the game together, record with the Minimal Recorder while you play and open the recordings in Electron afterwards.',
        ramNote: true,
    },
    {
        for: ['android'],
        title: 'Track N Race for Android',
        intro: 'There\'s one Android build, the full app, for phones and tablets. Use it on its own, or alongside the desktop app.',
        builds: [
            {
                slug: 'android',
                name: 'Android',
                desc: 'The full Track N Race experience, on Android.',
                pros: [
                    'Direct mode: the game sends telemetry straight to your phone or tablet',
                    'Paired mode: mirrors the desktop app running on your computer',
                ],
                cons: [],
                specs: [['File', '.apk']],
                cta: 'Download the .apk',
            },
        ],
        advice: 'Once it\'s downloaded, open the .apk on your phone or tablet to install it. Android may ask you to allow installs from your browser first.',
    },
];

export const osLabels: Record<string, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android' };
