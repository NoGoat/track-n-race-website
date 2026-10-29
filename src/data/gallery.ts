import { screens } from './screens';

// The Gallery's screens, grouped by area; they're numbered in this order
export const groups = [
    { id: "gallery-overview", title: "Overview", screens: ["overview", "overview_table", "other_drivers", "editor"] },
    { id: "gallery-car", title: "Car", screens: ["inputs", "power", "damage", "misc"] },
    { id: "gallery-tyres", title: "Tyres", screens: ["tyres", "tyres_charts"] },
    { id: "gallery-race", title: "Race", screens: ["session", "standings", "previous_lap_times", "strategy"] },
    { id: "gallery-analysis", title: "Analysis", screens: ["analyze", "trends"] },
];
export const numbers = new Map(groups.flatMap(group => group.screens).map((file, i) => [file, i + 1]));
// The Android tab leaves out screens the app doesn't have, so it numbers and counts its own
export const androidNumbers = new Map(groups.flatMap(group => group.screens).filter(file => screens[file].android).map((file, i) => [file, i + 1]));
export const androidCount = (files: string[]) => files.filter(file => screens[file].android).length;
