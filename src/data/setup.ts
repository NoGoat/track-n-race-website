// The Setup page's questions and icons, shared with its versions for no JavaScript (pages/no-js/setup/)
import { platformIcons } from './icons';

// Shared icons (Lucide-style strokes; brand marks from Simple Icons, CC0)
export const icon = {
    monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
    gamepad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M6 12h4m-2-2v4m7-2h.01m2.99 0h.01"></path></svg>',
    phone: platformIcons.phone,
    both: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="4" width="15" height="11" rx="2"></rect><line x1="5" y1="19" x2="11" y2="19"></line><rect x="16" y="9" width="7" height="12" rx="1.5"></rect></svg>',
    laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="11" rx="1.5"></rect><path d="M2 19h20"></path></svg>',
    windows: platformIcons.windows,
    apple: platformIcons.apple,
    tux: platformIcons.tux,
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
};

// The questions, in order. data-when (see scripts/setup.js) says which answers a block needs to be shown.
export const questions: { name: string; title: string; when?: string; options: { value: string; label: string; desc?: string; icon?: string }[] }[] = [
    {
        name: 'platform',
        title: 'What do you play F1 on?',
        options: [
            { value: 'pc', label: 'PC', desc: 'Steam or EA app', icon: icon.monitor },
            { value: 'console', label: 'PlayStation or Xbox', desc: 'PS5, PS4, Xbox Series X|S or One', icon: icon.gamepad },
        ],
    },
    {
        name: 'game',
        title: 'Which game?',
        when: 'platform=*',
        options: [
            { value: 'f124', label: 'F1 24' },
            { value: 'f125', label: 'F1 25' },
            { value: 'f126', label: 'F1 25 + 2026 Season Pack' },
        ],
    },
    {
        name: 'view',
        title: 'Where do you want to see your telemetry?',
        when: 'game=*',
        options: [
            { value: 'computer', label: 'On a computer', desc: 'Windows, macOS or Linux', icon: icon.laptop },
            { value: 'android', label: 'On an Android phone or tablet', desc: 'iOS not supported', icon: icon.phone },
            { value: 'both', label: 'Both Android and PC', desc: 'The phone mirrors the desktop app', icon: icon.both },
        ],
    },
    {
        name: 'host',
        title: 'Which computer runs Track N Race?',
        when: 'platform=pc view=computer,both',
        options: [
            { value: 'same', label: 'The PC I play on', desc: 'Second monitor, or alt-tab', icon: icon.monitor },
            { value: 'other', label: 'A different computer', desc: 'Laptop, Mac or second PC', icon: icon.laptop },
        ],
    },
    {
        name: 'os',
        title: 'What does that computer run?',
        // Asked for the gaming PC too: it can be a Mac or Linux box running the game through CrossOver or Proton.
        // Consoles always need a separate computer, so they skip the question above and land here.
        when: 'host=*',
        options: [
            { value: 'windows', label: 'Windows', icon: icon.windows },
            { value: 'macos', label: 'macOS', icon: icon.apple },
            { value: 'linux', label: 'Linux', icon: icon.tux },
        ],
    },
];
