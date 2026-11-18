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
    /** Open Graph type: 'website' unless set. Only the TNRD write-up is an article. */
    type?: 'website' | 'article';
    /** An article's publish date (YYYY-MM-DD), for its article:published_time tag */
    published?: string;
    robots?: string;
}

export const pages = {
    home: {
        path: "/",
        title: "Track N Race — Free F1 Telemetry & Lap Analysis",
        description: "Track N Race records and analyzes F1 24, F1 25, and 2026 Season Pack telemetry on Windows, macOS, Linux and Android. Compare laps, driver inputs, tyre wear, ERS, fuel, and delta times for free.",
        socialDescription: "Record and analyze F1 24, F1 25, and 2026 Season Pack telemetry on Windows, macOS, Linux and Android. Compare laps, driver inputs, tyre wear, ERS, fuel, and delta times for free.",
        type: "website",
    },
    gallery: {
        path: "/gallery/",
        title: "Gallery — Track N Race",
        description: "Every screen of Track N Race in the Electron and Native frontends and the Android app: overview, inputs, power, damage, tyres, standings, strategy, lap analysis and trends.",
    },
    compare: {
        path: "/frontends/",
        title: "Frontends — Track N Race Electron vs Native vs Android",
        heading: "The frontends of Track N Race",
        intro: "Electron and Native are the full desktop app, built two different ways. The Minimal Recorder only records, in as little memory as possible. Android is the full app on a phone or tablet. They all read the same telemetry from the F1 games.",
        description: "Compare Track N Race's Electron and Native frontends, the Minimal Recorder and the Android app: where each runs, how much memory it uses, what it can do, then every screen side by side, from the overview and lap analysis to standings, tyres and strategy.",
    },
    download: {
        path: "/download/",
        title: "Download Track N Race — Electron, Native, Minimal Recorder or Android",
        description: "Download Track N Race for Windows, macOS, Linux or Android. Pick your platform for a short guide to the Electron, Native and Minimal Recorder builds, then download the one that suits your setup.",
    },
    setup: {
        path: "/setup/",
        title: "F1 Game telemetry Setup Guide — Configure UDP for Track N Race",
        heading: 'Telemetry <span class="gradient-text">setup guide</span>',
        intro: "Tell us how you play, and we'll tell you exactly what to set in the game and in Track N Race.",
        description: "Answer a few questions to get the exact UDP telemetry settings for F1 24, F1 25 and 2026 Season Pack with Track N Race: same PC, second computer, PS5, Xbox, or Android in Direct or Paired mode.",
    },
    troubleshooting: {
        path: "/troubleshooting/",
        title: "Troubleshooting — Track N Race Telemetry Not Showing Up",
        heading: "Troubleshooting",
        intro: "Find the problem that matches what you see. Each one opens to the fix.",
        description: "Fixes for F1 telemetry not reaching Track N Race: the game not sending, Windows Firewall, macOS and Linux firewalls, the wrong IP address, port 20777 in use, guest Wi-Fi, AP isolation, mesh Wi-Fi, Android permissions and Paired mode.",
    },
    tnrd: {
        path: "/tnrd/",
        title: "The .tnrd Format — How Track N Race Stores Telemetry",
        description: "How the Track N Race recording format evolved from a single gzipped JSON stream (TNRD V1) to an indexed, per-driver, per-lap, per-data-type container (TNRD V6), and what each version changed.",
        type: "article",
        published: "2026-11-17",
    },
    analysis: {
        path: "/analysis/",
        title: "Analysis Map Tour — Track N Race 1.7.0",
        description: "Try the Track N Race 1.7.0 Analysis map on two real races: Track Dominance, Driver Inputs, Speed, ERS Usage and ERS Harvest layers, braking points and the data comparison panel.",
        robots: "index, follow",
    },
    credits: {
        path: "/credits/",
        title: "Credits & Licensing — Track N Race",
        heading: "Credits",
        intro: "The following open source projects made Track N Race possible. Note that this is in no way trying to affiliate Track N Race with these projects. I just felt that it was appropriate to shout out these projects since these helped me in creation of Track N Race.",
        description: "Track N Race open source attributions, third-party libraries, and additional information for Web, desktop and Android telemetry frontends.",
        socialDescription: "Track N Race open source attributions, third-party libraries, and GNU General Public License v3.0 information for Web, desktop and Android telemetry frontends.",
    },
    privacy: {
        path: "/privacy/",
        title: "Privacy Policy — Track N Race Android App, Desktop App & Website",
        description: "Privacy Policy for the Track N Race Android app, Desktop app and website. Learn how they handle telemetry data, device permissions, local storage, update checks and app updates, website download counts, and your privacy.",
        robots: "index, follow",
    },
} satisfies Record<string, PageMeta>;
