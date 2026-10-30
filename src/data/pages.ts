// Each page's title, description and address, for its <head> (components/PageHead.astro)
export interface PageMeta {
    path: string;
    title: string;
    description: string;
    /** For link previews (Open Graph, Twitter), when it differs from the search description */
    socialDescription?: string;
    /** The page header's title (may hold markup) and intro */
    heading?: string;
    intro?: string;
    type?: 'website' | 'article';
    robots?: string;
}

export const pages = {
    home: {
        path: "/",
        title: "Track N Race — Free F1 Telemetry & Lap Analysis",
        description: "Track N Race records and analyzes F1 24, F1 25, and 2026 Season Pack telemetry. Compare laps, driver inputs, tyre wear, ERS, fuel, and delta times for free.",
        socialDescription: "Record and analyze F1 24, F1 25, and 2026 Season Pack telemetry. Compare laps, driver inputs, tyre wear, ERS, fuel, and delta times for free.",
        type: "website",
    },
    gallery: {
        path: "/gallery/",
        title: "Gallery — Track N Race",
        description: "Every screen of Track N Race in the Electron and Native frontends and the Android app: overview, inputs, power, damage, tyres, standings, strategy, lap analysis and trends.",
    },
    compare: {
        path: "/electron-vs-qt/",
        title: "Frontends — Track N Race Electron vs Native",
        heading: "Compare Frontends",
        intro: "Electron, Native or the Minimal Recorder. Compare them to decide which one you prefer.",
        description: "Compare the Electron and Native frontends of Track N Race and the Minimal Recorder: platforms, RAM use and features in one table, then every screen side by side, from the overview and lap analysis to standings, tyres and strategy.",
    },
    download: {
        path: "/download/",
        title: "Download Track N Race — Electron, Native or Minimal Recorder",
        description: "Download Track N Race for Windows, macOS, Linux or Android. Pick your platform for a short guide to the Electron, Native and Minimal Recorder builds, then download the one that suits your setup.",
    },
    setup: {
        path: "/setup/",
        title: "F1 Game telemetry Setup Guide — Configure UDP for Track N Race",
        heading: 'Telemetry <span class="gradient-text">setup guide</span>',
        intro: "Tell us how you play, and we'll tell you exactly what to set in the game and in Track N Race.",
        description: "Answer a few questions to get the exact UDP telemetry settings for F1 24, F1 25 and 2026 Season Pack with Track N Race: same PC, second computer, PS5, Xbox, or Android in Direct or Paired mode.",
    },
    tnrd: {
        path: "/tnrd/",
        title: "The .tnrd Format — How Track N Race Stores Telemetry",
        description: "How the Track N Race recording format evolved from a single gzipped JSON stream (TNRD V1) to an indexed, per-driver, per-lap, per-data-type container (TNRD V6), and what each version changed.",
    },
    credits: {
        path: "/credits/",
        title: "Credits & Licensing — Track N Race",
        heading: "Credits",
        intro: "The following open source projects made Track N Race possible. Note that this is in no way trying to affiliate Track N Race with these projects. I just felt that it was appropriate to shout out these projects since these helped me in creation of Track N Race.",
        description: "Track N Race open source attributions, third-party libraries, and additional information for Web and desktop telemetry frontends.",
        socialDescription: "Track N Race open source attributions, third-party libraries, and GNU General Public License v3.0 information for Web and desktop telemetry frontends.",
    },
    privacy: {
        path: "/privacy/",
        title: "Privacy Policy — Track N Race Android App, Desktop App & Website",
        description: "Privacy Policy for the Track N Race Android app, Desktop app and website. Learn how they handle telemetry data, device permissions, local storage, update checks, website download counts, and your privacy.",
        robots: "index, follow",
    },
} satisfies Record<string, PageMeta>;
