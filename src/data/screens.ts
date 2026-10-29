// Every app screen with screenshots in both frontends, under public/assets/screenshots/ (Electron) and
// .../qt/ (Qt). Each has a .webp at full size plus .avif copies at the listed widths, named <file>-<width>.avif.
// Screens the Android app also has carry an `android` entry, under .../android/.
// Used by the Gallery and the Frontends page.

/** The Android app's capture of a screen: a Pixel Tablet in landscape, status and gesture bars cropped */
export interface AndroidShot {
    /** The screen's name in the Android app, when it differs from the desktop one */
    name?: string;
    /** Gallery caption; the Android screen is laid out differently from the desktop one */
    desc: string;
    alt: string;
}

/** Full size and AVIF widths of every Android capture */
export const ANDROID_SIZE = { width: 2560, height: 1488, widths: [1280, 1920, 2560] };

export interface Screen {
    /** File name without extension, the same for both frontends */
    file: string;
    name: string;
    /** Gallery caption */
    desc: string;
    /** Alt text for the Gallery. Both frontends capture the same moment of the same São Paulo race, so it fits either one. */
    alt: string;
    /** Full size of the capture. 2624x1624 with the window's shadow; Overview is pre-trimmed to 2492x1492. */
    width: number;
    height: number;
    /** AVIF widths for the Electron and Qt captures */
    widths: number[];
    qtWidths: number[];
    /** Missing when the Android app doesn't have this screen */
    android?: AndroidShot;
}

const FULL = [1280, 1920, 2624];

const list: Screen[] = [
    {
        file: "overview", name: "Overview",
        desc: "Speed, RPM and ERS traces for the lap, with tyre temperatures, wing and floor damage underneath.",
        alt: "Overview screen with speed, RPM and ERS traces from a lap, plus live tyre temperatures and damage readouts",
        width: 2492, height: 1492, widths: [1280, 1920, 2492], qtWidths: [2492],
        android: {
            name: "Drive",
            desc: "The Drive tab: lap time, delta and sectors, gear, speed and pedals, with ERS, fuel, gaps and tyres alongside.",
            alt: "Android Drive tab with the running lap time, delta to best, sector splits, gear, speed, throttle and brake, plus ERS, fuel, gaps, lap times and tyre wear",
        },
    },
    {
        file: "overview_table", name: "Data Tables",
        desc: "If you don't want graphs, you can swap them out for tables.",
        alt: "Overview screen with the charts swapped for data tables of speed, RPM, ERS and tyre temperatures",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
    },
    {
        file: "other_drivers", name: "View Other Drivers",
        desc: "View telemetry for other drivers. Looks like Albon is doing a fine job here.",
        alt: "Overview screen switched to Albon's car, showing his speed, RPM and ERS traces, fuel and position",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
        android: {
            desc: "Follow any car in the session. Here it's Albon in tenth.",
            alt: "Android Drive tab switched to Albon in tenth, showing his lap, gear, speed, ERS, fuel and the gaps to Gasly and Sainz",
        },
    },
    {
        file: "editor", name: "Layout Editor",
        desc: "Enable or disable cards based on your needs.",
        alt: "Layout editor for choosing which sections appear on the overview screen",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
    },
    {
        file: "inputs", name: "Inputs",
        desc: "Track your acceleration, brake, gear and steering inputs. Duh.",
        alt: "Gear, throttle and brake, and steering input charts over a lap",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
        android: {
            desc: "Gear, throttle and brake, and steering across the lap.",
            alt: "Android Inputs charts with gear, throttle and brake, and steering over a lap",
        },
    },
    {
        file: "power", name: "Power",
        desc: "Track engine and fuel status.",
        alt: "Power screen with ICE and MGU-K power split, ERS harvest, ERS store and fuel charts",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
        android: {
            desc: "Engine power, ERS harvest and store, and fuel across the lap.",
            alt: "Android Power charts with ICE and MGU-K power, ERS harvest, ERS store and fuel over a lap",
        },
    },
    {
        file: "damage", name: "Damage",
        desc: "Damage and wear for every part of the car, from the wings and floor to the power unit.",
        alt: "Top-down car diagram with tyre wear, brake and wing damage, plus power unit wear along the bottom",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
        android: {
            desc: "Tyre, wing and floor damage on the car, with power unit wear beside it.",
            alt: "Android Damage tab with a top-down car showing tyre wear and wing, floor and sidepod damage, next to power unit wear bars",
        },
    },
    {
        file: "misc", name: "Misc",
        desc: "Lateral and longitudinal G-force, plus front and rear ride height.",
        alt: "Lateral and longitudinal G-force charts above front and rear ride height charts over a lap",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
        android: {
            desc: "Lateral and longitudinal G-force, plus front and rear ride height.",
            alt: "Android Misc charts with lateral and longitudinal G-force above front and rear ride height over a lap",
        },
    },
    {
        file: "tyres", name: "Tyres",
        desc: "Get a list of all the available compounds for the weekend.",
        alt: "Tyre allocation listing every dry and wet set with wear, remaining life and lap-time delta, next to live tyre and brake temperatures",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
        android: {
            name: "Tyre Allocation",
            desc: "Every set for the weekend, with wear, life and where it was used.",
            alt: "Android tyre allocation listing every dry and wet set with status, wear, life and session",
        },
    },
    {
        file: "tyres_charts", name: "Tyre Graphs",
        desc: "Monitor compound degradation, surface, and inner carcass temperatures.",
        alt: "Surface, inner and brake temperature charts plus tyre life for all four tyres",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
        android: {
            name: "Tyre Charts",
            desc: "Surface, inner and brake temperatures, and tyre wear.",
            alt: "Android tyre charts with surface, inner and brake temperatures and tyre wear for all four corners",
        },
    },
    {
        file: "session", name: "Session",
        desc: "Live map with every car's position, the race details and an events feed.",
        alt: "Session view with a live map of São Paulo showing every car's position, race details and an events feed",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
        android: {
            name: "Map",
            desc: "Every car on the live map.",
            alt: "Android Map tab with every car's position around São Paulo",
        },
    },
    {
        file: "standings", name: "Standings",
        desc: "If you are looking for telemetry software, you know what a timing tower is. I am not explaining that.",
        alt: "Timing tower with positions, last lap, gaps and sector times for all 22 cars, plus the player's ERS, fuel and tyre info",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
        android: {
            name: "Timing",
            desc: "The timing tower for the whole field.",
            alt: "Android Timing tab listing all 22 cars with lap, last lap, gap and tyre",
        },
    },
    {
        file: "previous_lap_times", name: "View Previous Times",
        desc: "View previous lap and sector times for all drivers.",
        alt: "Lap times popup from the standings, listing every lap with sector splits and the fastest lap and sectors highlighted",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
    },
    {
        file: "strategy", name: "Race Strategy",
        desc: "This is a work in progress so expect the module to recreate Monaco 2022.",
        alt: "Strategy screen comparing a conservative and an aggressive plan with target lap times for each stint",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
        android: {
            name: "Strategy",
            desc: "When to box and onto what, for defending or attacking.",
            alt: "Android Strategy tab with the next stop, defend and attack plans across the race, and pace against the plan",
        },
    },
    {
        file: "analyze", name: "Analysis",
        desc: "Compare any channel across your own laps, a rival’s, or a lap from an older session.",
        alt: "Analysis view overlaying throttle, speed, RPM, gear and MGU-K power traces for two laps",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
        android: {
            name: "Analysis",
            desc: "Two of your laps side by side, with the map and sector deltas.",
            alt: "Android Analysis split view comparing laps 7 and 9 with delta, throttle, speed, ERS and brake traces beside the track map",
        },
    },
    {
        file: "trends", name: "Trends",
        desc: "Lap times, ERS and tyre wear across the whole race, lap by lap.",
        alt: "Lap time, ERS used and recharged, and tyre wear for all four tyres plotted across every lap of the race",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
        android: {
            desc: "Lap times, ERS and tyre wear across the stint.",
            alt: "Android Trends chart with lap times, ERS used and recharged, and tyre wear over the final laps",
        },
    },
];

export const screens: Record<string, Screen> = Object.fromEntries(list.map(s => [s.file, s]));
