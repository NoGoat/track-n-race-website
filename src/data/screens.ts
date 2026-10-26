// Every app screen with screenshots in both frontends, under public/assets/screenshots/ (Electron) and
// .../qt/ (Qt). Each has a .webp at full size plus .avif copies at the listed widths, named <file>-<width>.avif.
// Used by the Gallery and the Frontends page.

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
}

const FULL = [1280, 1920, 2624];

const list: Screen[] = [
    {
        file: "overview", name: "Overview",
        desc: "Speed, RPM and ERS traces for the lap, with tyre temperatures, wing and floor damage underneath.",
        alt: "Overview screen with speed, RPM and ERS traces from a lap, plus live tyre temperatures and damage readouts",
        width: 2492, height: 1492, widths: [1280, 1920, 2492], qtWidths: [2492],
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
    },
    {
        file: "power", name: "Power",
        desc: "Track engine and fuel status.",
        alt: "Power screen with ICE and MGU-K power split, ERS harvest, ERS store and fuel charts",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
    },
    {
        file: "damage", name: "Damage",
        desc: "Damage and wear for every part of the car, from the wings and floor to the power unit.",
        alt: "Top-down car diagram with tyre wear, brake and wing damage, plus power unit wear along the bottom",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
    },
    {
        file: "misc", name: "Misc",
        desc: "Lateral and longitudinal G-force, plus front and rear ride height.",
        alt: "Lateral and longitudinal G-force charts above front and rear ride height charts over a lap",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
    },
    {
        file: "tyres", name: "Tyres",
        desc: "Get a list of all the available compounds for the weekend.",
        alt: "Tyre allocation listing every dry and wet set with wear, remaining life and lap-time delta, next to live tyre and brake temperatures",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
    },
    {
        file: "tyres_charts", name: "Tyre Graphs",
        desc: "Monitor compound degradation, surface, and inner carcass temperatures.",
        alt: "Surface, inner and brake temperature charts plus tyre life for all four tyres",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
    },
    {
        file: "session", name: "Session",
        desc: "Live map with every car's position, the race details and an events feed.",
        alt: "Session view with a live map of São Paulo showing every car's position, race details and an events feed",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
    },
    {
        file: "standings", name: "Standings",
        desc: "If you are looking for telemetry software, you know what a timing tower is. I am not explaining that.",
        alt: "Timing tower with positions, last lap, gaps and sector times for all 22 cars, plus the player's ERS, fuel and tyre info",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
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
    },
    {
        file: "analyze", name: "Analysis",
        desc: "Compare any channel across your own laps, a rival’s, or a lap from an older session.",
        alt: "Analysis view overlaying throttle, speed, RPM, gear and MGU-K power traces for two laps",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
    },
    {
        file: "trends", name: "Trends",
        desc: "Lap times, ERS and tyre wear across the whole race, lap by lap.",
        alt: "Lap time, ERS used and recharged, and tyre wear for all four tyres plotted across every lap of the race",
        width: 2624, height: 1624, widths: FULL, qtWidths: FULL,
    },
];

export const screens: Record<string, Screen> = Object.fromEntries(list.map(s => [s.file, s]));
