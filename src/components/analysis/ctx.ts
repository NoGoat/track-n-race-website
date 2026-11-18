// The Analysis copy's state, shared by the window, the screen and the tour.
import { createContext, useContext } from 'react'
import type { Clock } from './clock'
import type { LapInfo, SeriesConfig, TourData } from './lib'
import type { MapColoring } from './MapPane'

export interface AnalyzeConfig {
    collapsed: boolean
    view: 'graph' | 'split' | 'map'
    individualGraphs: boolean
    syncedTooltip: boolean
    sectorBoundaries: boolean
    sectorDelta: boolean
    splitCursors: boolean
    brakingPoints: boolean
    inputPanel: boolean
    /** Show the Braking Zones sidebar */
    zonesPanel: boolean
    /** The Braking Zones sidebar's width, in pixels */
    zonesWidth: number
    /** The Braking Zones sidebar: the zone list's share of the height above the detail card */
    zonesListRatio: number
    mapColoring: MapColoring
    currentLabel: string
    compareLabel: string
    lapALabel: string
    lapBLabel: string
    mapCurrentColor: string
    mapComparisonColor: string
    series: SeriesConfig[]
}

/** Lap A / Lap B, as lap keys (LapInfo.key) */
export interface FixedLapMode { enabled: boolean; lapA: string | null; lapB: string | null }
/** The lap groups whose Driver field picks a car */
export type DriverGroup = 'lapA' | 'lapB' | 'compare'

/** What the tour allows while it runs: layers and controls not yet reached stay locked */
export interface TourLock { layers: Set<string>; controls: Set<string> }

export interface AppState {
    data: TourData | null
    map: any
    fileName: string | null
    config: AnalyzeConfig
    save: (next: AnalyzeConfig) => void
    fixed: FixedLapMode
    setFixed: (next: FixedLapMode) => void
    /** The player's lap the session clock is in */
    currentLap: number | null
    /** Compare's lap key */
    compareLap: string | null
    setCompareLap: (lap: string | null) => void
    /** Each lap group's driver while it has no lap (a chosen lap's driver is the lap's own) */
    groupDrivers: Record<DriverGroup, number | null>
    setGroupDriver: (group: DriverGroup, driver: number) => void
    seekLap: (lap: number) => void
    clock: Clock
    fixedClock: Clock
    elapsedSource: () => number
    primary: LapInfo | null
    comparison: LapInfo | null
    lock: TourLock | null
    emit: (event: string) => void
    openHelp: () => void
    /** Whether a part of the screen has been revealed yet (the run builds the screen one part at a time) */
    shows: (key: string) => boolean
    /** The part revealed last, for an effect on things that stay mounted (the Layer menu's options) */
    fresh: string | null
    /** The menu the run holds open: 'lapA', 'lapB' or 'layer' */
    forcedMenu: string | null
}

export const AppCtx = createContext<AppState | null>(null)
export const useApp = () => useContext(AppCtx)!
