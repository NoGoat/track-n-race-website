import { platformIcons } from './icons';

// Step 01 on the Download page (scripts/download-page.js)
export const platformQuestion = 'What are you downloading for?';
export const platforms = [
    { os: 'windows', label: 'Windows', desc: 'Electron, Native or Minimal', icon: platformIcons.windows },
    { os: 'macos', label: 'macOS', desc: 'Electron or Minimal', icon: platformIcons.apple },
    { os: 'linux', label: 'Linux', desc: 'Electron, Native or Minimal', icon: platformIcons.tux },
    { os: 'android', label: 'Android', desc: 'The full app, as an .apk', icon: platformIcons.android },
];

// The Download page's guides, one per platform (pages/download.astro). Their numbers come from the Frontends page's
// table. A value given per OS shows only on that platform.
export type PerOs = string | Record<string, string>;
export interface Build {
    slug: string;
    name: string;
    // The column's title, set like the home page's frontend titles: the second word in the frontend's colour
    title: [string, string];
    // The frontend's trace colour (--trace-<color> in styles/base.css), the same one its home page title uses
    color: 'periwinkle' | 'lilac' | 'coral' | 'mint';
    stack?: PerOs;
    desc: string;
    pros: string[];
    cons: string[];
    // Memory use against the platform's other builds, as a three-segment meter: 3 the most, 1 the least
    memory?: { level: 1 | 2 | 3; label: string };
    specs: [string, PerOs][];
    // The download button's label, when "Download <name>" doesn't read well
    cta?: string;
    // A role above the title (label) and a line under it (text), for the one thing to know before picking it.
    // pick is the default choice: its role takes the frontend's colour and it gets the green "Recommended for most
    // users" badge. alt is the fallback and warn a catch; both keep the role grey.
    badge?: { label: string; text: string; tone: 'pick' | 'alt' | 'warn' };
    // What stops the first launch on this OS, above the download button with a link to the Setup wizard's steps
    launch?: PerOs;
    // The strip's heading and link when "First launch" and "How to launch the app" don't fit (the Android install)
    launchTitle?: string;
    launchLink?: string;
    // A P.S. above the first-launch note, one paragraph per entry
    ps?: string[];
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
// None of the Windows or macOS builds are signed, and every Linux build is an AppImage
const unsignedLaunch = {
    macos: "macOS will block it the first time you open it, because it isn't signed with an Apple Developer certificate.",
    windows: "Windows SmartScreen will warn you the first time you run it, because it isn't code-signed.",
    linux: "The AppImage won't run until you make it executable with chmod +x.",
};

export const dives: Dive[] = [
    {
        for: ['windows', 'linux'],
        title: 'Electron, Native or Minimal?',
        intro: 'Electron and Native are both the full app, with the same screens: live telemetry, lap analysis, the layout editor and playback. The difference is how they feel, how much memory they use, and where else they run. Both record your sessions too; the Minimal Recorder does only that, in as little memory as possible.',
        builds: [
            {
                slug: 'electron',
                name: 'Electron',
                title: ['Electron', 'Frontend'],
                color: 'periwinkle',
                stack: 'Electron, React',
                badge: { label: 'Recommended', text: 'The recommended choice for most users', tone: 'pick' },
                desc: 'The full app, and the same one on Windows, macOS and Linux.',
                pros: [
                    'Uses web first UX principles, making it easier to use for new or web centric users',
                    'Feels more modern, with a web-style look',
                    'Every screen, recording, playback and UDP forwarding',
                ],
                cons: [
                    'Most RAM hungry. Most systems should however be able to handle this.',
                    'Lacks certain desktop specific UX features. However, these are mostly small QoL features. No core functionality is lost.'
                ],
                memory: { level: 3, label: 'Most' },
                specs: [
                    ['File', winLinuxFile('.exe', '.AppImage')],
                ],
                launch: unsignedLaunch,
            },
            {
                slug: 'qt',
                name: 'Native',
                title: ['Native', 'Frontend'],
                color: 'lilac',
                stack: 'Qt',
                badge: { label: 'Lighter', text: 'Alternative to Electron', tone: 'alt' },
                desc: 'Every screen Electron has, built with Qt, in a good deal less memory.',
                pros: [
                    'Feels more analytical and native, like a desktop tool',
                    'Uses less RAM. Ideal for lower end rigs or sim users who prefer the lower footprint.',
                    'Leaves more memory for the game when both run on one PC',
                    'Uses desktop specific UX principles, offering more control in certain areas. For example, the Analysis editor has popout dialogs where inline menus can be dragged out into their own dialog window.',
                    'Note that these are simply QoL features. Electron still has complete parity in functionality.'
                ],
                cons: [
                    'No macOS build: on a Mac you need Electron',
                ],
                memory: { level: 2, label: 'Less' },
                specs: [
                    ['File', winLinuxFile('.exe', '.AppImage')],
                ],
                launch: unsignedLaunch,
            },
            {
                slug: 'minimal',
                name: 'Minimal Recorder',
                title: ['Minimal', 'Recorder'],
                color: 'coral',
                stack: { windows: 'Win32', linux: 'Qt' },
                badge: { label: 'Recorder only', text: 'Needs Electron or Native to view the recordings', tone: 'warn' },
                desc: 'Records your sessions in as little memory as possible, with no screens of its own.',
                pros: [
                    'Built for maximum resource optimization, when your PC can\'t spare the memory for the game and a full app together',
                    'Ideal for users who don\'t need the full interface while driving. Drive the race then check out the recorded telemetry in the Electron or Qt builds.',
                    'Forwards UDP to other apps',
                ],
                cons: [
                    'No live telemetry, lap analysis or ... anything. This is a pure headless recorder for gamers who want zero interruption while playing.',
                ],
                memory: { level: 1, label: 'Least' },
                specs: [
                    ['File', winLinuxFile('.zip', '.AppImage')],
                ],
                launch: {
                    ...unsignedLaunch,
                    windows: "Windows SmartScreen will warn you the first time you run it, because it isn't code-signed.",
                },
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
                title: ['Electron', 'Frontend'],
                color: 'periwinkle',
                stack: 'Electron, React',
                // Most users today are used to web UX. They live in a website. So, Electron is recommended as the default.
                // Sure it uses more RAM and Electron is basically Chromium hell, but the user experience triumphs it all.
                // Besides after optimization, it's not that bad. Most users wouldn't even feel the Electron app while racing.
                // The recommended badge is a target for these users. If a user is more desktop-centric, they would clearly
                // know enough to know that they are not the ones targeted by the usual Recommended badges and pick the Native build.
                badge: { label: 'Recommended', text: 'The recommended choice for most users', tone: 'pick' },
                desc: 'The full app: live telemetry, lap analysis, the layout editor and playback of your recordings.',
                pros: [
                    'Everything Track N Race does, on macOS',
                    'Opens the sessions the Minimal Recorder records',
                ],
                cons: [
                    'Most RAM hungry. Most Macs should however be able to handle this.',
                ],
                memory: { level: 3, label: 'Most' },
                specs: [
                    ['File', '.dmg'],
                ],
                launch: unsignedLaunch,
            },
            {
                slug: 'minimal',
                name: 'Minimal Recorder',
                title: ['Minimal', 'Recorder'],
                color: 'coral',
                stack: 'Swift',
                badge: { label: 'Recorder only', text: 'Needs Electron to view the recordings', tone: 'warn' },
                desc: 'Records your sessions in as little memory as possible, with no screens of its own.',
                pros: [
                    'Built to use minimal resources and record the sessions.',
                    'Forwards UDP to other apps',
                ],
                cons: [
                    'No live telemetry, lap analysis or ... anything. This is a pure headless recorder for gamers who want zero interruption while playing.',
                ],
                ps: [
                    'MacOS does not run the F1 games. So, most users will probably not need this and prefer the full Electron app. This is purely provided for the hardcore nerd that wants a minimal UI on a secondary system. Honestly, respect.'
                ],
                memory: { level: 1, label: 'Least' },
                specs: [
                    ['File', '.dmg'],
                ],
                launch: unsignedLaunch,
            },
        ],
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
                title: ['Android', 'App'],
                color: 'mint',
                desc: 'The full Track N Race experience, on Android.',
                pros: [
                    'Has feature parity with the Desktop app.',
                    'Direct mode: the game sends telemetry straight to your phone or tablet',
                    'Paired mode: mirrors the desktop app running on your computer',
                ],
                cons: [],
                specs: [['File', '.apk']],
                cta: 'Download the .apk',
                launch: 'Once it\'s downloaded, open the .apk on your phone or tablet to install it. Android may ask you to allow installs from your browser first.',
                launchTitle: 'Installing it',
                launchLink: 'How to install the app',
            },
        ],
    },
];

export const osLabels: Record<string, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android' };
