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
    mapColoring: MapColoring
    currentLabel: string
    compareLabel: string
    lapALabel: string
    lapBLabel: string
    mapCurrentColor: string
    mapComparisonColor: string
    series: SeriesConfig[]
}

export interface FixedLapMode { enabled: boolean; lapA: number | null; lapB: number | null }

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
    currentLap: number | null
    compareLap: number | null
    setCompareLap: (lap: number | null) => void
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
