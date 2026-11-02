// The Analysis screen (electron-frontend components/AnalyzeScreen.tsx): the sidebar of view toggles, map layer,
// lap groups and metric cards, the chart toolbar with its sector delta readout, and the charts/split/map surfaces.
// Markup and classes ported as written.
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
    ArrowLeft, ArrowRight, Axis3d, ChartNoAxesCombined, ChevronLeft, ChevronRight, CircleHelp, Columns2, Columns3, Disc3, Eye, Gauge,
    GripVertical, LineChart, ListChevronsUpDown, Map as MapIcon, Palette, PanelLeftClose, PanelLeftOpen, Plus, RotateCcw, Rows3,
    Search, SeparatorVertical, Trash2, Upload, X, ZoomIn, ZoomOut,
} from 'lucide-react'
import Select, { buildSelectStyles, displayOnlySelectComponents, portalTarget, selectComponents, SELECT_MENU_ANIMATION_MS } from './select'
import Charts from './Charts'
import { toCamera } from './camera'
import ColorPicker from './ColorPicker'
import MapPane, { mapHooks } from './MapPane'
import PlaybackBar from './PlaybackBar'
import { useClock } from './clock'
import { useApp, type AnalyzeConfig } from './ctx'
import {
    COMBINED_BY_ID, METRICS, METRIC_BY_ID, METRIC_CATEGORIES, TYRE_CORNERS, TYRE_ROWS, compoundColor, compoundName, fmtDelta, fmtLap,
    indexAtTime, channelAt, cornerKeyOf, sanitizeCorners, seriesLineColor, seriesScaleDef,
    DEFAULT_DELTA_NEGATIVE_COLOR, DEFAULT_DELTA_POSITIVE_COLOR, type SeriesConfig, type TourData,
} from './lib'

const ANALYZE_TOGGLE_BUTTON_CLASS = 'analyze-toggle-button flex h-8 min-w-0 flex-1 items-center justify-center rounded focus-visible:outline-none disabled:pointer-events-none disabled:opacity-35'
const ANALYZE_COMPARISON_COLOR_CLASS = 'h-5 w-5 shrink-0 cursor-pointer rounded border border-[var(--border)] shadow-inner'
const BUTTON_BASE_CLASS = 'h-8 rounded border inline-flex items-center justify-center gap-2 px-4 shadow-sm transition-[background-color,border-color,color,box-shadow,filter] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-info)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-panel)] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none'
export const BUTTON_CLASS = `${BUTTON_BASE_CLASS} text-[10px] font-semibold normal-case tracking-normal border-[var(--border-muted)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[var(--border-focus)] hover:bg-[var(--bg-hover)] hover:brightness-110`

export const MAP_COLORING_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'dominance', label: 'Track Dominance' },
    { value: 'inputs', label: 'Driver Inputs' },
    { value: 'speed', label: 'Speed' },
    { value: 'ers', label: 'ERS Usage' },
    { value: 'harvest', label: 'ERS Harvest' },
] as const

const lapSelectStyles = buildSelectStyles({ solidBg: true, controlHeight: 32, labelStyleGroupHeadings: true, menuWidth: 'calc(100% + 50px)' })
const driverSelectStyles = buildSelectStyles({ solidBg: true, controlHeight: 32, labelStyleGroupHeadings: true, menuWidth: 'max(260px, calc(100% + 50px))' })

// ── Laps ────────────────────────────────────────────────────────────────────
interface LapOption { value: string; lapNum: number; compound: string | null; compoundColor: string | null; lapTime: string | null; isFastest: boolean; isDisabled: boolean; label: string }
function FastestLapChip() {
    return <span className="ml-2 text-[10px] font-medium uppercase tracking-wide rounded px-2 py-0.5 select-none shrink-0"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-fastest) 14%, transparent)', color: 'var(--color-fastest)' }}>FL</span>
}
function formatLapOption(option: LapOption) {
    return <span className="inline-flex items-center min-w-0">
        {option.compound && <span style={{ color: option.compoundColor ?? 'var(--text-primary)' }}>{option.compound}</span>}
        <span>{option.compound ? <>&nbsp;· </> : ''}Lap {option.lapNum}</span>
        {option.lapTime && <span>&nbsp;· {option.lapTime}</span>}
        {option.isFastest && <FastestLapChip />}
    </span>
}
export function lapOptions(data: TourData | null): LapOption[] {
    if (!data) return []
    // Only the laps this page has data for
    return data.lapTimes.filter(([lap]) => !!data.laps[lap]).map(([lap, time, , visual, actual]) => {
        const compound = compoundName(actual)
        const lapTime = time > 0 ? fmtLap(time) : null
        return {
            value: String(lap), lapNum: lap, compound, compoundColor: compound ? compoundColor(visual) : null, lapTime,
            isFastest: lap === data.fastestLap, isDisabled: !data.laps[lap],
            label: `${compound ? `${compound} · ` : ''}Lap ${lap}${lapTime ? ` · ${lapTime}` : ''}`,
        }
    })
}

function AnalyzeComparisonSelector({ id, label, placeholder, value, options, onChange, isDisabled = false, displayOnly = false, forceOpen = false }: {
    id: string; label: string; placeholder: string; value: LapOption | null; options: { label: string; options: LapOption[] }[]
    onChange: (o: LapOption | null) => void; isDisabled?: boolean; displayOnly?: boolean; forceOpen?: boolean
}) {
    return <div className="flex items-center" data-tour={`${id}-field`}>
        <label htmlFor={id} title={label} className="mr-2 w-11 shrink-0 truncate text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">{label}</label>
        <div className="flex-1 min-w-0">
            <Select<LapOption, any> inputId={id} value={value} options={options} placeholder={placeholder} onChange={o => onChange(o)}
                formatOptionLabel={formatLapOption} styles={lapSelectStyles} isOptionDisabled={o => o.isDisabled}
                components={displayOnly ? displayOnlySelectComponents : selectComponents}
                isSearchable={false} isClearable={!displayOnly} isDisabled={isDisabled || displayOnly} forceOpen={forceOpen} />
        </div>
    </div>
}

function AnalyzeLabelInput({ id, label, placeholder, value, onChange }: { id: string; label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
    return <div className="flex items-center">
        <label htmlFor={id} className="mr-2 w-11 shrink-0 text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">{label}</label>
        <div className="relative min-w-0 flex-1">
            <input id={id} type="text" value={value} maxLength={40} autoComplete="off" spellCheck={false} aria-label={`${label} label`} placeholder={placeholder}
                onChange={event => onChange(event.target.value)}
                className="h-8 w-full rounded border border-[var(--border)] bg-[var(--bg-input)] px-2.5 pr-8 text-[11px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)] placeholder:opacity-80 focus:border-[var(--border-focus)]" />
            {value && <button type="button" title={`Clear ${label} label`} aria-label={`Clear ${label} label`} onMouseDown={e => e.preventDefault()} onClick={() => onChange('')}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"><X size={12} /></button>}
        </div>
    </div>
}

function DriverOptionRow({ option }: { option: any }) {
    return <div className="flex items-center gap-2 min-w-0">
        <span className="w-[3px] h-3.5 rounded-full shrink-0" style={{ background: option.teamColor }} />
        <span className="w-5 shrink-0 text-right tabular-nums font-semibold" style={{ color: 'var(--text-secondary)' }}>{option.number}</span>
        <span className="truncate font-medium">{option.label}</span>
        <span className="ml-auto truncate text-[10px]" style={{ color: 'var(--text-secondary)' }}>Player</span>
    </div>
}
function AnalyzeDriverField({ id, value, options, displayOnly = false, isDisabled = false }: { id: string; value: any; options: any[]; displayOnly?: boolean; isDisabled?: boolean }) {
    return <div className="flex items-center">
        <label htmlFor={id} className="mr-2 w-11 shrink-0 text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">Driver</label>
        <div className="min-w-0 flex-1">
            <Select inputId={id} value={value} options={options} placeholder="Select driver…" styles={driverSelectStyles}
                formatOptionLabel={(option: any, { context }: any) => context === 'value' ? option.label : <DriverOptionRow option={option} />}
                components={displayOnly ? displayOnlySelectComponents : selectComponents}
                isSearchable={false} isClearable={false} isDisabled={isDisabled || displayOnly} />
        </div>
    </div>
}

function AnalyzeComparisonGroup({ title, colorPicker, showColorPicker, driverValue, lapValue, driverOptions, driverDisplayOnly = false, children }: {
    title: string; colorPicker: ReactNode; showColorPicker: boolean; driverValue: any; lapValue: LapOption | null; driverOptions: any[]
    driverDisplayOnly?: boolean; children: ReactNode
}) {
    const idBase = title.toLowerCase().replace(/\s+/g, '-')
    const [collapsed, setCollapsed] = useState(false)
    return <section className="overflow-hidden border-t border-[var(--border)] last:border-b" data-tour={`group-${idBase}`}>
        <div className={`flex h-9 items-center pl-2 pr-0 ${collapsed ? '' : 'border-b border-[var(--border)]'}`}>
            {collapsed ? <span className="flex min-w-0 items-center gap-1.5 truncate text-[10px] font-semibold">
                <span className="truncate text-[var(--text-primary)]">{driverValue?.label ?? '-'}</span>
                <span className="text-[var(--text-secondary)]">·</span>
                <span style={{ color: lapValue?.compoundColor ?? 'var(--text-secondary)' }}>{lapValue?.compound ?? '-'}</span>
                <span className="text-[var(--text-secondary)]">·</span>
                <span className="shrink-0 text-[var(--text-primary)]">{lapValue ? `Lap ${lapValue.lapNum}` : '-'}</span>
                <span className="text-[var(--text-secondary)]">·</span>
                <span className="shrink-0 text-[var(--text-primary)]">{lapValue?.lapTime ?? '-'}</span>
            </span> : <span className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">{title}</span>}
            <div className="ml-auto flex items-center">
                <div className={`analyze-map-color-slot ${showColorPicker ? 'analyze-map-color-slot--visible' : ''}`}>
                    <div className="analyze-map-color-slot__inner">{colorPicker}</div>
                </div>
                <button type="button" className="analyze-input-comparison__action mr-2" onClick={() => setCollapsed(c => !c)}
                    aria-expanded={!collapsed} aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`} title={collapsed ? `Expand ${title}` : `Collapse ${title}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M5 12h14" />
                        <path d="M12 5v14" className="analyze-input-comparison__toggle-stroke" />
                    </svg>
                </button>
            </div>
        </div>
        <div className={`analyze-comparison-group__body ${collapsed ? '' : 'analyze-comparison-group__body--expanded'}`} aria-hidden={collapsed}>
            <div className="analyze-comparison-group__body-inner">
                <div className="space-y-1.5 p-2">
                    <AnalyzeDriverField id={`analyze-${idBase}-driver`} value={driverValue} options={driverOptions} displayOnly={driverDisplayOnly} isDisabled={driverOptions.length <= 1} />
                    {children}
                </div>
            </div>
        </div>
    </section>
}

// ── Metric picker (AnalyzeMetricPicker.tsx) ─────────────────────────────────
const PICKER_WIDTH = 266
const CORNER_METRIC_IDS = new Set(TYRE_ROWS.flatMap(row => TYRE_CORNERS.map(corner => `${row.idPrefix}-${corner.key}`)))
const CORNER_TERMS = TYRE_CORNERS.map(corner => corner.label).join(' ')
// Every token must appear somewhere, so "rear ride" and "ride rear" both find Rear Ride Height
const matchesQuery = (query: string, haystack: string) => !query || query.split(/\s+/).every(token => haystack.toLowerCase().includes(token))

// Each category is a divider-separated block of toggle chips. Per-corner tyre metrics form a matrix: FL / FR / RL / RR
// pick corners, ALL picks or clears all four, and COM switches the row between a card per corner and one combined card.
function AnalyzeMetricPicker({ selectedIds, combinedCorners, forceOpen, onToggle, onToggleTyreCorner, onToggleTyreAllCorners, onToggleTyreCombined }: {
    selectedIds: Set<string>; combinedCorners: Map<string, string[]>; forceOpen: boolean
    onToggle: (id: string) => void
    onToggleTyreCorner: (idPrefix: string, cornerKey: string) => void
    onToggleTyreAllCorners: (idPrefix: string) => void
    onToggleTyreCombined: (idPrefix: string) => void
}) {
    const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed')
    const [query, setQuery] = useState('')
    const buttonRef = useRef<HTMLButtonElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const [position, setPosition] = useState({ left: 0, top: 0, width: PICKER_WIDTH, maxHeight: 400 })
    const open = phase === 'open'
    const close = () => { if (phase === 'open') setPhase('closing') }
    const openPanel = () => {
        // Right-aligned to the button, so the panel opens back over the sidebar; placed in the camera's coordinates
        const screen = buttonRef.current!.getBoundingClientRect()
        const r = toCamera(screen)
        const width = PICKER_WIDTH
        setPosition({ left: Math.max(8, r.left + r.width - width), top: r.top + r.height + 4, width, maxHeight: Math.max(160, (innerHeight - screen.bottom - 12) / r.scale) })
        setQuery('')
        setPhase('open')
    }
    // The run opens and closes the picker itself
    const forced = useRef(false)
    useEffect(() => {
        if (forceOpen) { forced.current = true; openPanel() }
        else if (forced.current) { forced.current = false; setPhase(p => p === 'open' ? 'closing' : p) }
    }, [forceOpen]) // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (phase !== 'closing') return
        const t = setTimeout(() => setPhase('closed'), SELECT_MENU_ANIMATION_MS)
        return () => clearTimeout(t)
    }, [phase])
    useEffect(() => {
        if (!open || forceOpen) return
        const onDown = (e: PointerEvent) => {
            if (!panelRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) close()
        }
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { buttonRef.current?.focus(); close() } }
        document.addEventListener('pointerdown', onDown)
        document.addEventListener('keydown', onKey)
        return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
    })

    const q = query.trim().toLowerCase()
    const tiles = new Map(METRIC_CATEGORIES.map(entry => [entry,
        METRICS.filter(m => m.group === entry && !CORNER_METRIC_IDS.has(m.id) && matchesQuery(q, `${entry} ${m.label} ${m.unit}`))]))
    const tyreRows = TYRE_ROWS.filter(row => matchesQuery(q, `tyres tires ${row.label} all com combined ${CORNER_TERMS}`))
    const sections = METRIC_CATEGORIES.filter(entry => (tiles.get(entry)?.length ?? 0) > 0 || (entry === 'Tyres' && tyreRows.length > 0))
    // Enter charts the first visible metric that is not charted yet
    const addFirstMatch = () => {
        const next = sections.flatMap(entry => (tiles.get(entry) ?? []).map(m => m.id)).find(id => !selectedIds.has(id))
        if (next) onToggle(next)
    }

    const chip = (id: string, label: string) => {
        const on = selectedIds.has(id)
        return <button key={id} type="button" data-tour={`metric-${id}`} aria-pressed={on} title={`${on ? 'Remove' : 'Add'} ${label}`} onClick={() => onToggle(id)}
            className={`h-6 px-2 rounded border text-[10px] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-info)] ${on
                ? 'border-[var(--border-focus)] bg-[var(--border-focus)] text-white'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-focus)] hover:text-[var(--text-primary)]'}`}>{label}</button>
    }
    const tyreCell = (key: string, title: string, on: boolean, onClick: () => void) =>
        <button key={key} type="button" aria-pressed={on} title={title} aria-label={title} onClick={onClick}
            className={`w-[22px] h-5 rounded border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-info)] ${on
                ? 'border-[var(--border-focus)] bg-[var(--border-focus)]'
                : 'border-[var(--border)] hover:border-[var(--border-focus)] hover:bg-[var(--bg-hover)]'}`} />
    const columnLabel = (label: string) => <span key={label} className="w-[22px] text-center text-[8px] tracking-wider text-[var(--text-secondary)]">{label}</span>
    const tyreMatrix = () => <div className="grid grid-cols-[auto_repeat(6,22px)] gap-x-1 gap-y-1 items-center justify-start">
        <span />
        {columnLabel('COM')}
        {TYRE_CORNERS.map(corner => columnLabel(corner.label))}
        {columnLabel('ALL')}
        {tyreRows.flatMap(row => {
            const corners = combinedCorners.get(`${row.idPrefix}-all`)
            const combined = corners !== undefined
            const picked = TYRE_CORNERS.map(corner => combined ? corners.includes(corner.key) : selectedIds.has(`${row.idPrefix}-${corner.key}`))
            const allPicked = picked.every(Boolean)
            return [
                <span key={`${row.idPrefix}-label`} className={`pr-2 text-[10px] whitespace-nowrap ${picked.some(Boolean) ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>{row.label}</span>,
                tyreCell(`${row.idPrefix}-all`, combined ? `Show ${row.label} corners as separate graphs` : `Show ${row.label} corners together in one graph`,
                    combined, () => onToggleTyreCombined(row.idPrefix)),
                ...TYRE_CORNERS.map((corner, index) => tyreCell(`${row.idPrefix}-${corner.key}`, `${picked[index] ? 'Remove' : 'Add'} ${row.label} ${corner.label}`,
                    picked[index], () => onToggleTyreCorner(row.idPrefix, corner.key))),
                tyreCell(`${row.idPrefix}-every`, `${allPicked ? 'Remove' : 'Add'} all ${row.label} corners`, allPicked, () => onToggleTyreAllCorners(row.idPrefix)),
            ]
        })}
    </div>
    // The tyre matrix and the whole-car tyre averages are separate blocks
    const blocks = sections.flatMap(entry => {
        const entryTiles = tiles.get(entry) ?? []
        const out: { key: string; label: string; content: ReactNode }[] = []
        if (entry === 'Tyres' && tyreRows.length > 0) out.push({ key: 'Tyres-corners', label: 'Tyres by corner', content: tyreMatrix() })
        if (entryTiles.length > 0) out.push({
            key: entry, label: entry === 'Tyres' ? 'Tyre averages' : entry,
            content: <div className="flex flex-wrap gap-1">{entryTiles.map(m => chip(m.id, m.label))}</div>,
        })
        return out
    })

    return <>
        <button ref={buttonRef} type="button" data-tour="metrics-button" title="Add Metrics" aria-label="Add Metrics" aria-haspopup="dialog" aria-expanded={open}
            onClick={() => open ? close() : openPanel()}
            className={`w-7 h-7 rounded flex items-center justify-center shrink-0 transition-colors hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] ${open ? 'text-[var(--text-primary)] bg-[var(--bg-hover)]' : 'text-[var(--text-secondary)]'}`}
        ><Plus size={15} /></button>
        {phase !== 'closed' && createPortal(<div ref={panelRef} role="dialog" aria-label="Add Metrics"
            className="fixed z-[10000] flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg-menu)] font-mono shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden select-none"
            style={{ ...position, animation: `${open ? 'selectMenuEnterBottom' : 'selectMenuExitBottom'} ${SELECT_MENU_ANIMATION_MS}ms cubic-bezier(0.2, 0, 0, 1) both`, pointerEvents: open ? undefined : 'none' }}>
            <div className="p-2 border-b border-[var(--border)] shrink-0">
                <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
                    {/* The run's opening doesn't focus the search, so a phone's keyboard stays down */}
                    <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addFirstMatch() }}
                        placeholder="Filter metrics" aria-label="Filter metrics" autoFocus={!forceOpen}
                        className="h-7 w-full rounded border border-[var(--border)] bg-[var(--bg-input)] pl-7 pr-2.5 text-[11px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)] placeholder:opacity-80 focus:border-[var(--border-focus)]" />
                </div>
            </div>
            <div className="pb-1 overflow-y-auto">
                {blocks.map((block, index) => <div key={block.key} role="group" aria-label={block.label}
                    className={`px-3 py-2.5 ${index > 0 ? 'border-t border-[var(--border)]' : ''}`}>{block.content}</div>)}
                {sections.length === 0 && <div className="px-2 py-4 text-center text-[11px] text-[var(--text-secondary)]">No metrics match “{query.trim()}”</div>}
            </div>
        </div>, portalTarget())}
    </>
}

// ── Sector delta readout (AnalysisDeltaReadout) ─────────────────────────────
function AnalysisDeltaReadout() {
    const app = useApp()
    const clock = useClock(app.fixed.enabled ? app.fixedClock : app.clock)
    const { data, primary, comparison } = app
    const values = useMemo(() => {
        if (!data || !primary || !comparison) return [null, null, null, null]
        const delta = data.deltas[`${primary.lap}-${comparison.lap}`]
        if (!delta) return [null, null, null, null]
        const pts = delta.samples.filter(s => s[2])
        const at = (d: number) => { const p = pts.find(([pd]) => pd >= d); return p ? p[1] : pts[pts.length - 1]?.[1] ?? 0 }
        const ends = [primary.s1EndM, primary.s2EndM, data.trackLengthM]
        const cursor = app.fixed.enabled ? null
            : channelAt(primary.trace, 'd', indexAtTime(primary.trace, Math.min(app.elapsedSource(), primary.time)))
        const sectors = ends.map((end, i) => {
            const start = i ? ends[i - 1] : 0
            if (cursor !== null && cursor < start) return null
            return at(cursor !== null ? Math.min(end, cursor) : end) - (i ? at(start) : 0)
        })
        return [...sectors, cursor !== null ? at(cursor) : at(data.trackLengthM)]
    }, [app, clock.time, comparison, data, primary]) // eslint-disable-line react-hooks/exhaustive-deps
    const series = app.config.series.find(s => s.metricId === 'delta')
    const positive = series?.color ?? DEFAULT_DELTA_POSITIVE_COLOR
    const negative = series?.negativeColor ?? DEFAULT_DELTA_NEGATIVE_COLOR
    if (!app.shows('readout')) return null
    return <div className="rv flex h-full items-center gap-3 font-mono tabular-nums" data-tour="delta-readout">
        {(['S1', 'S2', 'S3', 'Lap'] as const).map((label, index) => {
            const v = values[index]
            return <span key={label} className="flex h-full items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase leading-none tracking-wider text-[var(--text-secondary)]">{label}</span>
                <span className="inline-block w-[3.5rem] text-left text-[11px] font-semibold leading-none"
                    style={{ color: v === null || Math.abs(v) < 0.0005 ? 'var(--text-secondary)' : v > 0 ? positive : negative }}>{fmtDelta(v)}</span>
            </span>
        })}
    </div>
}

function FixedBar() {
    const app = useApp()
    const state = useClock(app.fixedClock)
    const total = Math.max(app.primary?.time ?? 0, app.comparison?.time ?? 0)
    return <PlaybackBar compact showExport={false}
        state={{ currentTime: state.time, isPlaying: state.playing, progressPct: total > 0 ? state.time / total : 0, speed: state.speed, totalTime: total }}
        onSeekProgress={p => app.fixedClock.set({ time: p * total })}
        onSeekBackward={() => app.fixedClock.set({ time: state.time - 5 })}
        onSeekForward={() => app.fixedClock.set({ time: state.time + 5 })}
        onSpeedChange={speed => app.fixedClock.set({ speed })}
        onTogglePlay={() => { app.fixedClock.set({ playing: !state.playing }); if (!state.playing) app.emit('play') }} />
}

export function AnalysisHelpItem({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
    return <div className="flex min-w-0 gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)]/30 p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[var(--border-focus)] text-white">{icon}</span>
        <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-primary)]">{label}</div>
            <div className="mt-1 text-[10px] leading-relaxed text-[var(--text-secondary)]">{children}</div>
        </div>
    </div>
}

/** The Synced Tooltip icon (assets/icons/synced-tooltip.svg) */
export function SyncedTooltipIcon({ size = 16 }: { size?: number }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 14h7" />
    </svg>
}

export default memo(function Screen() {
    const app = useApp()
    const { config, save, data, fixed, setFixed, lock } = app
    const [draggedMetric, setDraggedMetric] = useState<string | null>(null)
    const [xRange, setXRange] = useState<[number, number] | null>(null)
    const [splitRatio, setSplitRatio] = useState(0.5)
    const splitRef = useRef<HTMLDivElement>(null)
    const allowed = (control: string) => !lock || lock.controls.has(control)
    const { shows, fresh } = app
    const rest = shows('rest')
    const playbackFilename = app.fileName
    const primaryView = config.view
    const mapVisible = primaryView !== 'graph'
    const splitView = primaryView === 'split'
    const chartsVisible = primaryView !== 'map'

    const options = useMemo(() => lapOptions(data), [data])
    const groups = useMemo(() => [{ label: 'Primary File', options }], [options])
    const optionFor = (lap: number | null) => options.find(o => o.lapNum === lap) ?? null
    const driverOptions = useMemo(() => data ? [{ value: 'file1:0', label: data.driver.name, number: data.driver.number, teamColor: '#5794F2' }] : [], [data])
    const driverValue = driverOptions[0] ?? null
    // The Layer menu gains each layer as the run reaches it
    const layerOptions = MAP_COLORING_OPTIONS.filter(o => shows(`layer:${o.value}`))
    const set = (patch: Partial<AnalyzeConfig>) => save({ ...config, ...patch })
    const updateSeries = (series: AnalyzeConfig['series']) => set({ series })
    const moveMetric = (id: string, dir: number) => {
        const i = config.series.findIndex(s => s.metricId === id), j = i + dir
        if (j < 0 || j >= config.series.length) return
        const next = [...config.series];
        [next[i], next[j]] = [next[j], next[i]]
        updateSeries(next)
    }
    const dropMetric = (target: string) => {
        if (!draggedMetric || draggedMetric === target) return
        const next = config.series.filter(s => s.metricId !== draggedMetric)
        next.splice(next.findIndex(s => s.metricId === target), 0, config.series.find(s => s.metricId === draggedMetric)!)
        updateSeries(next)
    }
    /** Charts or removes metrics; charting a corner takes it off its row's combined card */
    const setMetricsSelected = (ids: string[], selected: boolean) => {
        if (!selected) { updateSeries(config.series.filter(s => !ids.includes(s.metricId))); return }
        const charted = new Set(config.series.map(s => s.metricId))
        const added = ids.filter(id => !charted.has(id) && METRIC_BY_ID.has(id))
        const owners = new Set(added.flatMap(id => [...COMBINED_BY_ID.values()].filter(c => c.memberIds.includes(id)).map(c => c.id)))
        if (added.length) updateSeries([...config.series.filter(s => !owners.has(s.metricId)),
            ...added.map(id => ({ metricId: id, color: METRIC_BY_ID.get(id)!.defaultColor, visible: true, showYAxis: true }))])
    }
    const toggleMetric = (id: string) => setMetricsSelected([id], !config.series.some(s => s.metricId === id))
    // With a row combined, its corners are picked on the combined card; otherwise each corner is its own card
    const toggleTyreCorner = (idPrefix: string, cornerKey: string) => {
        const combined = config.series.find(s => s.metricId === `${idPrefix}-all`)
        if (!combined) { toggleMetric(`${idPrefix}-${cornerKey}`); return }
        const corners = combined.corners ?? []
        const next = corners.includes(cornerKey) ? corners.filter(k => k !== cornerKey) : sanitizeCorners([...corners, cornerKey])
        updateSeries(config.series.map(s => s === combined ? { ...s, corners: next } : s))
    }
    // Picks every corner of a row, or clears them all when all four are picked
    const toggleTyreAllCorners = (idPrefix: string) => {
        const combined = config.series.find(s => s.metricId === `${idPrefix}-all`)
        if (combined) {
            const all = sanitizeCorners(combined.corners ?? []).length === TYRE_CORNERS.length
            updateSeries(config.series.map(s => s === combined ? { ...s, corners: all ? [] : sanitizeCorners() } : s))
            return
        }
        const ids = TYRE_CORNERS.map(c => `${idPrefix}-${c.key}`)
        const charted = new Set(config.series.map(s => s.metricId))
        setMetricsSelected(ids, !ids.every(id => charted.has(id)))
    }
    // Combining merges the row's charted corners into one card where the first of them sat; separating splits it back
    const toggleTyreCombined = (idPrefix: string) => {
        const combinedId = `${idPrefix}-all`
        const combined = config.series.find(s => s.metricId === combinedId)
        if (combined) {
            const split = (combined.corners ?? []).map(key => {
                const id = `${idPrefix}-${key}`
                return { metricId: id, color: seriesLineColor(combined, id), visible: combined.visible, showYAxis: combined.showYAxis }
            })
            updateSeries(config.series.flatMap(s => s === combined ? split : [s]))
            return
        }
        const memberIds = new Set(COMBINED_BY_ID.get(combinedId)!.memberIds)
        const members = config.series.filter(s => memberIds.has(s.metricId))
        const cornerColors = Object.fromEntries(members.flatMap(s => s.color !== METRIC_BY_ID.get(s.metricId)!.defaultColor ? [[s.metricId.slice(idPrefix.length + 1), s.color]] : []))
        const merged: SeriesConfig = {
            metricId: combinedId, color: COMBINED_BY_ID.get(combinedId)!.defaultColor,
            visible: members.length === 0 || members.some(s => s.visible), showYAxis: members.length === 0 || members.some(s => s.showYAxis),
            corners: sanitizeCorners(members.map(s => s.metricId.slice(idPrefix.length + 1))),
            cornerColors: Object.keys(cornerColors).length ? cornerColors : undefined,
        }
        const insertAt = config.series.findIndex(s => memberIds.has(s.metricId))
        const next = config.series.filter(s => !memberIds.has(s.metricId))
        next.splice(insertAt < 0 ? next.length : insertAt, 0, merged)
        updateSeries(next)
    }
    const combinedCorners = new Map(config.series.flatMap(s => COMBINED_BY_ID.has(s.metricId) ? [[s.metricId, s.corners ?? []] as const] : []))
    const allAxesEnabled = config.series.every(s => s.showYAxis)
    const zoomEnabled = fixed.enabled && !!app.primary
    const L = data?.trackLengthM ?? 1
    const zoom = (factor: number) => {
        const [a, b] = xRange ?? [0, L]
        const mid = (a + b) / 2, half = Math.max(12.5, ((b - a) / 2) * factor)
        setXRange([Math.max(0, mid - half), Math.min(L, mid + half)])
    }
    const pan = (dir: number) => {
        const [a, b] = xRange ?? [0, L]
        const shift = (b - a) * 0.25 * dir
        const na = Math.max(0, Math.min(L - (b - a), a + shift))
        setXRange([na, na + (b - a)])
    }
    useEffect(() => { if (!fixed.enabled) setXRange(null) }, [fixed.enabled])

    const view = (next: AnalyzeConfig['view']) => { set({ view: next }); app.emit(`view:${next}`) }
    const toggle = (key: keyof AnalyzeConfig, event?: string) => {
        const next = !config[key]
        set({ [key]: next } as Partial<AnalyzeConfig>)
        if (next && event) app.emit(event)
    }
    const mapColorPicker = (label: string, color: string, key: 'mapCurrentColor' | 'mapComparisonColor') =>
        <ColorPicker label={label} color={color} onChange={c => set({ [key]: c } as Partial<AnalyzeConfig>)} triggerClassName={`relative ${ANALYZE_COMPARISON_COLOR_CLASS}`} />
    const labelInput = (id: string, placeholder: string, key: 'currentLabel' | 'compareLabel' | 'lapALabel' | 'lapBLabel') =>
        <AnalyzeLabelInput id={id} label="Name" placeholder={placeholder} value={config[key]} onChange={v => set({ [key]: v } as Partial<AnalyzeConfig>)} />

    return <div className="h-full flex overflow-hidden border-t border-[var(--border)] bg-[var(--bg-panel)]">
        <aside className={`${config.collapsed ? 'w-0 border-r-0' : 'w-[315px] border-r'} shrink-0 border-[var(--border)] overflow-hidden bg-[var(--bg-panel)] transition-[width] duration-200`}>
            <div className={`w-[315px] h-full flex flex-col ${config.collapsed ? 'invisible' : 'visible'}`}>
                <div className="h-11 px-3 flex items-center gap-3 border-b border-[var(--border)] shrink-0">
                    <div className="flex-1 text-[11px] font-bold uppercase tracking-widest text-[var(--text-primary)]">Analysis</div>
                    {(rest || shows('metrics')) && <div className="rv" data-tour="metrics"><AnalyzeMetricPicker selectedIds={new Set(config.series.map(s => s.metricId))}
                        combinedCorners={combinedCorners} forceOpen={app.forcedMenu === 'metrics'} onToggle={toggleMetric}
                        onToggleTyreCorner={toggleTyreCorner} onToggleTyreAllCorners={toggleTyreAllCorners} onToggleTyreCombined={toggleTyreCombined} /></div>}
                </div>

                {shows('comparison') && <div data-tour="sidebar-controls"
                    // Its bottom line shows once Toggle Y-Axes closes the block, fading in (the border keeps its place)
                    className={`p-3 border-b space-y-3 shrink-0 transition-[border-color] duration-500 ${rest || shows('series') ? 'border-[var(--border)]' : 'border-[var(--border)] border-b-transparent'}`}>
                    {(shows('split') || rest) && <div className="flex gap-2" data-tour="views">
                        {rest && <button type="button" aria-label="Graphs" aria-pressed={primaryView === 'graph'} title="Graphs" onClick={() => view('graph')}
                            className={`rv rv-grow ${ANALYZE_TOGGLE_BUTTON_CLASS} ${primaryView === 'graph' ? 'analyze-toggle-button--active' : ''}`}><LineChart size={15} /></button>}
                        {shows('split') && <button type="button" data-tour="split-button" aria-label="Split Mode" aria-pressed={primaryView === 'split'} title="Split Mode" disabled={!playbackFilename || !allowed('split')}
                            onClick={() => view('split')} className={`rv rv-grow ${ANALYZE_TOGGLE_BUTTON_CLASS} ${primaryView === 'split' ? 'analyze-toggle-button--active' : ''}`}><Columns2 size={15} /></button>}
                        {(rest || shows('map')) && <button type="button" data-tour="map-button" aria-label="Map" aria-pressed={primaryView === 'map'} title="Map" disabled={!playbackFilename || !allowed('split')}
                            onClick={() => view('map')} className={`rv rv-grow ${ANALYZE_TOGGLE_BUTTON_CLASS} ${primaryView === 'map' ? 'analyze-toggle-button--active' : ''}`}><MapIcon size={15} /></button>}
                    </div>}
                    <div className="grid grid-cols-4 gap-2" data-tour="toggles">
                        {rest && <button type="button" aria-label="Individual Graphs" aria-pressed={config.individualGraphs} title="Individual Graphs" onClick={() => toggle('individualGraphs')}
                            className={`rv ${ANALYZE_TOGGLE_BUTTON_CLASS} ${config.individualGraphs ? 'analyze-toggle-button--active' : ''}`}><Rows3 size={15} /></button>}
                        {rest && <button type="button" aria-label="Synced Tooltip" aria-pressed={config.syncedTooltip} title="Synced Tooltip" disabled={!config.individualGraphs} onClick={() => toggle('syncedTooltip')}
                            className={`rv ${ANALYZE_TOGGLE_BUTTON_CLASS} ${config.syncedTooltip ? 'analyze-toggle-button--active' : ''}`}><SyncedTooltipIcon size={15} /></button>}
                        {rest && <button type="button" aria-label="Sector Boundaries" aria-pressed={config.sectorBoundaries} title="Sector Boundaries" onClick={() => toggle('sectorBoundaries')}
                            className={`rv ${ANALYZE_TOGGLE_BUTTON_CLASS} ${config.sectorBoundaries ? 'analyze-toggle-button--active' : ''}`}><Columns3 size={15} /></button>}
                        {rest && <button type="button" aria-label="Sector Delta" aria-pressed={config.sectorDelta} title="Sector Delta" disabled={!config.sectorBoundaries} onClick={() => toggle('sectorDelta')}
                            className={`rv ${ANALYZE_TOGGLE_BUTTON_CLASS} ${config.sectorDelta ? 'analyze-toggle-button--active' : ''}`}><ChartNoAxesCombined size={15} /></button>}
                        {shows('comparison') && <button type="button" data-tour="comparison-toggle" aria-label="Comparison" aria-pressed={fixed.enabled} title="Comparison" disabled={!playbackFilename || !allowed('comparison')}
                            onClick={() => {
                                const enabled = !fixed.enabled
                                setFixed({ enabled, lapA: fixed.lapA ?? app.currentLap, lapB: fixed.lapB ?? app.compareLap })
                                app.fixedClock.set({ time: 0, playing: false })
                            }}
                            className={`rv ${ANALYZE_TOGGLE_BUTTON_CLASS} ${fixed.enabled ? 'analyze-toggle-button--active' : ''}`}><ListChevronsUpDown size={15} /></button>}
                        {rest && <button type="button" aria-label="Split Cursors" aria-pressed={config.splitCursors} title="Split Cursors" disabled={primaryView !== 'split' || !fixed.enabled} onClick={() => toggle('splitCursors')}
                            className={`rv ${ANALYZE_TOGGLE_BUTTON_CLASS} ${config.splitCursors ? 'analyze-toggle-button--active' : ''}`}><SeparatorVertical size={15} /></button>}
                        {shows('braking') && <button type="button" data-tour="braking-toggle" aria-label="Braking Points" aria-pressed={config.brakingPoints} title="Braking Points" disabled={!mapVisible || !allowed('braking')}
                            onClick={() => toggle('brakingPoints', 'braking')} className={`rv ${ANALYZE_TOGGLE_BUTTON_CLASS} ${config.brakingPoints ? 'analyze-toggle-button--active' : ''}`}><Disc3 size={15} /></button>}
                        {shows('panel') && <button type="button" data-tour="panel-toggle" aria-label="Data Comparison Panel" aria-pressed={config.inputPanel} title="Data Comparison Panel" disabled={!mapVisible || !allowed('panel')}
                            onClick={() => toggle('inputPanel', 'panel')} className={`rv ${ANALYZE_TOGGLE_BUTTON_CLASS} ${config.inputPanel ? 'analyze-toggle-button--active' : ''}`}><Gauge size={15} /></button>}
                    </div>
                    {mapVisible && shows('layer') && <div className="rv flex items-center" data-tour="layer">
                        <label htmlFor="analysis-map-coloring" className="mr-2 w-11 shrink-0 text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">Layer</label>
                        <div className="flex-1 min-w-0">
                            <Select<any> inputId="analysis-map-coloring" forceOpen={app.forcedMenu === 'layer'}
                                value={MAP_COLORING_OPTIONS.find(o => o.value === config.mapColoring) ?? MAP_COLORING_OPTIONS[0]}
                                options={layerOptions} classNames={{ option: (state: any) => fresh === `layer:${state.data.value}` ? 'rv-opt' : '' }}
                                onChange={(o: any) => {
                                    const v = o?.value ?? 'none'
                                    if (v !== config.mapColoring) mapHooks.crossfade?.()
                                    set({ mapColoring: v }); app.emit(`layer:${v}`)
                                }}
                                styles={lapSelectStyles} components={selectComponents} isSearchable={false} />
                        </div>
                    </div>}
                    {playbackFilename && rest && <div className="rv mb-1 space-y-1">
                        <div className="h-8 flex items-center gap-1 min-w-0">
                            <span className="flex-1 min-w-0 truncate text-[11px] text-[var(--text-secondary)]">Choose file</span>
                            <button type="button" title="Open Secondary File" aria-label="Open Secondary File"
                                className="w-7 h-7 rounded flex items-center justify-center shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-40"><Upload size={14} /></button>
                        </div>
                    </div>}
                    {(shows('lapA') || rest) && <div className="analyze-lap-mode-switch -mx-3">
                        <div className={`analyze-lap-mode-panel ${fixed.enabled ? 'analyze-lap-mode-panel--visible' : 'analyze-lap-mode-panel--hidden-left'}`} aria-hidden={!fixed.enabled}>
                            {shows('lapA') && <div className="rv"><AnalyzeComparisonGroup title="Lap A" showColorPicker={mapVisible} driverValue={driverValue} lapValue={optionFor(fixed.lapA)} driverOptions={driverOptions}
                                colorPicker={mapColorPicker('Lap A', config.mapCurrentColor, 'mapCurrentColor')}>
                                <AnalyzeComparisonSelector id="analyze-lap-a" forceOpen={app.forcedMenu === 'lapA'} label="Lap" value={optionFor(fixed.lapA)} options={groups} placeholder="Select lap…"
                                    onChange={o => { setFixed({ ...fixed, lapA: o?.lapNum ?? null }); app.fixedClock.set({ time: 0 }) }} />
                                {labelInput('analyze-lap-a-label', 'Lap A', 'lapALabel')}
                            </AnalyzeComparisonGroup></div>}
                            {shows('lapB') && <div className="rv"><AnalyzeComparisonGroup title="Lap B" showColorPicker={mapVisible} driverValue={driverValue} lapValue={optionFor(fixed.lapB)} driverOptions={driverOptions}
                                colorPicker={mapColorPicker('Lap B', config.mapComparisonColor, 'mapComparisonColor')}>
                                <AnalyzeComparisonSelector id="analyze-lap-b" forceOpen={app.forcedMenu === 'lapB'} label="Lap" value={optionFor(fixed.lapB)} options={groups} placeholder="Select lap…"
                                    onChange={o => { setFixed({ ...fixed, lapB: o?.lapNum ?? null }); app.fixedClock.set({ time: 0 }) }} />
                                {labelInput('analyze-lap-b-label', 'Lap B', 'lapBLabel')}
                            </AnalyzeComparisonGroup></div>}
                        </div>
                        {rest && <div className={`analyze-lap-mode-panel ${!fixed.enabled ? 'analyze-lap-mode-panel--visible' : 'analyze-lap-mode-panel--hidden-right'}`} aria-hidden={fixed.enabled}>
                            <AnalyzeComparisonGroup title="Current" showColorPicker={mapVisible} driverDisplayOnly driverValue={driverValue} lapValue={optionFor(app.currentLap)} driverOptions={driverOptions}
                                colorPicker={mapColorPicker('Current', config.mapCurrentColor, 'mapCurrentColor')}>
                                <AnalyzeComparisonSelector id="analyze-current-lap" label="Lap" placeholder="No current lap" value={optionFor(app.currentLap)} options={[]} onChange={() => { }} displayOnly />
                                {labelInput('analyze-current-label', 'Current', 'currentLabel')}
                            </AnalyzeComparisonGroup>
                            <AnalyzeComparisonGroup title="Compare" showColorPicker={mapVisible} driverValue={driverValue} lapValue={optionFor(app.compareLap)} driverOptions={driverOptions}
                                colorPicker={mapColorPicker('Compare', config.mapComparisonColor, 'mapComparisonColor')}>
                                <AnalyzeComparisonSelector id="analyze-compare-lap" label="Lap" placeholder="Select lap…" value={optionFor(app.compareLap)} options={groups}
                                    onChange={o => app.setCompareLap(o?.lapNum ?? null)} isDisabled={!playbackFilename} />
                                {labelInput('analyze-compare-label', 'Compare', 'compareLabel')}
                            </AnalyzeComparisonGroup>
                        </div>}
                    </div>}
                    {(rest || shows('series')) && <button type="button" onClick={() => updateSeries(config.series.map(item => ({ ...item, showYAxis: !allAxesEnabled })))} className={`rv ${BUTTON_CLASS} w-full`}>
                        <span>Toggle Y-Axes</span>
                    </button>}
                </div>}

                {(rest || shows('series')) && <div className="rv flex-1 min-h-0 overflow-y-auto p-2 pr-[2px] [scrollbar-gutter:stable] space-y-1" data-tour="series">
                    {config.series.length === 0 && <div className="p-4 text-center text-[10px] text-[var(--text-secondary)]">No metrics selected</div>}
                    {config.series.map((item, index) => {
                        const isDelta = item.metricId === 'delta'
                        const combined = COMBINED_BY_ID.get(item.metricId)
                        const def = seriesScaleDef(item.metricId)
                        const label = isDelta ? 'Delta' : combined ? `${combined.shortLabel} · Combined` : def!.label
                        const patch = (p: Partial<typeof item>) => updateSeries(config.series.map(e => e.metricId === item.metricId ? { ...e, ...p } : e))
                        return <div key={item.metricId} data-tour={`series-${item.metricId}`} draggable onDragStart={() => setDraggedMetric(item.metricId)} onDragEnd={() => setDraggedMetric(null)}
                            onDragOver={e => e.preventDefault()} onDrop={() => dropMetric(item.metricId)}
                            className={`flex items-center gap-1.5 px-1.5 py-1.5 rounded border border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-hover)] ${draggedMetric === item.metricId ? 'opacity-40' : ''}`}>
                            <GripVertical size={13} className="text-[var(--text-secondary)] cursor-grab shrink-0" />
                            {isDelta
                                ? <div className="flex gap-1 shrink-0">
                                    <ColorPicker label="Positive delta" color={item.color} onChange={c => patch({ color: c })} />
                                    <ColorPicker label="Negative delta" color={item.negativeColor ?? DEFAULT_DELTA_NEGATIVE_COLOR} onChange={c => patch({ negativeColor: c })} />
                                </div>
                                // A combined card's swatches: one per corner, corners not on the card disabled
                                : combined ? <div className="flex gap-1 shrink-0">{combined.memberIds.map(id => {
                                    const key = cornerKeyOf(item.metricId, id)!
                                    const picked = item.corners?.includes(key) ?? false
                                    const corner = TYRE_CORNERS.find(c => c.key === key)!.label
                                    return <span key={id} title={corner} className={`flex ${picked ? '' : 'grayscale opacity-30'}`}>
                                        <ColorPicker label={`${label} ${corner}`} color={seriesLineColor(item, id)} disabled={!picked} onChange={c => patch({ cornerColors: { ...item.cornerColors, [key]: c } })} />
                                    </span>
                                })}</div>
                                : <ColorPicker label={label} color={item.color} forceOpen={app.forcedMenu === `color:${item.metricId}`} onChange={c => patch({ color: c })} />}
                            <div className="flex-1 min-w-0">
                                <div className="text-[10px] truncate" style={{ color: combined ? item.color : 'var(--text-primary)' }}>{label}</div>
                                <div className="text-[8px] uppercase tracking-wider text-[var(--text-secondary)] truncate">
                                    {isDelta ? 'Time · + / −' : `${def!.group}${def!.unit ? ` · ${def!.unit}` : ''}`}
                                </div>
                            </div>
                            <div className="flex items-center shrink-0">
                                <button disabled={index === 0} title="Move up" onClick={() => moveMetric(item.metricId, -1)} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-20"><ChevronLeft size={12} className="rotate-90" /></button>
                                <button disabled={index === config.series.length - 1} title="Move down" onClick={() => moveMetric(item.metricId, 1)} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-20"><ChevronRight size={12} className="rotate-90" /></button>
                                <button title={item.showYAxis ? 'Hide Y-axis' : 'Show Y-axis'} onClick={() => patch({ showYAxis: !item.showYAxis })}
                                    className={`p-1 hover:text-[var(--text-primary)] ${item.showYAxis ? 'text-[var(--text-secondary)]' : 'text-[var(--text-inactive)]'}`}><Axis3d size={11} /></button>
                                <button title={item.visible ? 'Hide series' : 'Show series'} onClick={() => patch({ visible: !item.visible })}
                                    className={`p-1 hover:text-[var(--text-primary)] ${item.visible ? 'text-[var(--text-secondary)]' : 'text-[var(--text-inactive)]'}`}><Eye size={11} /></button>
                                <button title={isDelta ? 'Reset colors' : 'Reset color'} className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    onClick={() => patch(isDelta ? { color: DEFAULT_DELTA_POSITIVE_COLOR, negativeColor: DEFAULT_DELTA_NEGATIVE_COLOR }
                                        : combined ? { color: combined.defaultColor, cornerColors: undefined } : { color: def!.defaultColor })}><RotateCcw size={11} /></button>
                                {isDelta
                                    ? <button disabled title="Delta cannot be removed" className="p-1 text-[var(--text-inactive)] opacity-30 cursor-not-allowed"><Trash2 size={11} /></button>
                                    : <button title="Remove metric" onClick={() => toggleMetric(item.metricId)} className="p-1 text-[var(--text-secondary)] hover:text-[#d44252]"><Trash2 size={11} /></button>}
                            </div>
                        </div>
                    })}
                </div>}
            </div>
        </aside>

        <section className="flex-1 min-w-0 flex flex-col">
            <div className="h-11 px-2 border-b border-[var(--border)] flex items-center gap-1 shrink-0">
                {rest && <button title={config.collapsed ? 'Open Analysis controls' : 'Collapse Analysis controls'} onClick={() => set({ collapsed: !config.collapsed })}
                    className="rv w-7 h-7 rounded flex items-center justify-center shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
                    {config.collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
                </button>}
                {primaryView !== 'map' && rest && <>
                    <span className="h-5 w-px mx-1 bg-[var(--border)]" />
                    <span className="px-1 text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">Zoom</span>
                    <button disabled={!zoomEnabled} title="Zoom out" onClick={() => zoom(2)} className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-25 disabled:pointer-events-none"><ZoomOut size={14} /></button>
                    <button disabled={!zoomEnabled} title="Zoom in" onClick={() => zoom(0.5)} className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-25 disabled:pointer-events-none"><ZoomIn size={14} /></button>
                    <span className="h-5 w-px mx-1 bg-[var(--border)]" />
                    <span className="px-1 text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">Pan</span>
                    <button disabled={!zoomEnabled} title="Pan left" onClick={() => pan(-1)} className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-25 disabled:pointer-events-none"><ArrowLeft size={14} /></button>
                    <button disabled={!zoomEnabled} title="Pan right" onClick={() => pan(1)} className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-25 disabled:pointer-events-none"><ArrowRight size={14} /></button>
                    <button disabled={!zoomEnabled} title="Reset zoom" onClick={() => setXRange(null)} className="w-7 h-7 rounded flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-25 disabled:pointer-events-none"><RotateCcw size={13} /></button>
                </>}
                <div className="ml-auto flex shrink-0 items-center gap-3 pr-1">
                    <AnalysisDeltaReadout />
                    {rest && <button type="button" title="Analysis controls help" aria-label="Open Analysis controls help" onClick={app.openHelp}
                        className="rv w-7 h-7 rounded flex items-center justify-center shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"><CircleHelp size={15} /></button>}
                </div>
            </div>
            <div ref={splitRef} className="flex-1 min-h-0 relative flex">
                <div className={`analysis-view-surface ${splitView ? 'relative shrink-0 grow-0 min-w-0 overflow-hidden' : 'absolute inset-0'} ${chartsVisible ? 'analysis-view-surface--visible' : ''}`}
                    style={splitView ? { flexBasis: `${splitRatio * 100}%` } : undefined} aria-hidden={!chartsVisible}>
                    {data && <Charts series={config.series} current={app.primary} comparison={app.comparison}
                        delta={app.primary && app.comparison ? data.deltas[`${app.primary.lap}-${app.comparison.lap}`] ?? null : null}
                        stacked={config.individualGraphs} sectorBoundaries={config.sectorBoundaries} sectorDelta={config.sectorDelta}
                        syncedTooltip={config.syncedTooltip} trackLength={data.trackLengthM} xRange={xRange} elapsedSource={app.elapsedSource}
                        showMapCursors={splitView && fixed.enabled && config.splitCursors} mapCurrentColor={config.mapCurrentColor} mapComparisonColor={config.mapComparisonColor}
                        currentLabel={labelsOf(app)[0]} comparisonLabel={labelsOf(app)[1]} quiet={!rest}
                        onInspect={elapsed => {
                            if (fixed.enabled) app.fixedClock.set({ time: elapsed, playing: false })
                            else if (app.primary) app.clock.set({ time: app.primary.start + elapsed, playing: false })
                            if (config.view === 'graph') view('split')
                        }} />}
                </div>
                {splitView && <div className="relative z-20 w-px shrink-0 bg-[var(--border)]">
                    <div className="absolute inset-y-0 -left-[3px] w-[7px] cursor-col-resize touch-none"
                        onPointerDown={e => {
                            const el = splitRef.current!
                            e.currentTarget.setPointerCapture(e.pointerId)
                            const move = (ev: PointerEvent) => {
                                const r = el.getBoundingClientRect()
                                setSplitRatio(Math.max(0.2, Math.min(0.8, (ev.clientX - r.left) / r.width)))
                            }
                            const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
                            window.addEventListener('pointermove', move)
                            window.addEventListener('pointerup', up)
                        }} />
                </div>}
                {mapVisible && data && <div className={`rv-slide analysis-view-surface ${splitView ? 'relative flex-1 min-w-0 overflow-hidden' : 'absolute inset-0'} analysis-view-surface--visible`}>
                    <MapPane data={data} map={app.map} current={app.primary} comparison={app.comparison}
                        currentColor={config.mapCurrentColor} comparisonColor={config.mapComparisonColor}
                        currentLabel={labelsOf(app)[0]} comparisonLabel={labelsOf(app)[1]}
                        mapColoring={config.mapColoring} brakingPoints={config.brakingPoints} showInputPanel={config.inputPanel}
                        elapsedSource={app.elapsedSource} fixedMode={fixed.enabled} fixedBar={<FixedBar />}
                        onMarkHover={kind => { if (kind) app.emit(kind) }} />
                </div>}
            </div>
        </section>
    </div>
})

export function labelsOf(app: { config: AnalyzeConfig; fixed: { enabled: boolean } }): [string, string] {
    const c = app.config
    return app.fixed.enabled
        ? [c.lapALabel.trim() || 'Lap A', c.lapBLabel.trim() || 'Lap B']
        : [c.currentLabel.trim() || 'Current', c.compareLabel.trim() || 'Compare']
}

export const HELP_ITEMS: [ReactNode, string, string][] = [
    [<LineChart size={15} />, 'Graphs', 'Shows the data in Graphs.'],
    [<Columns2 size={15} />, 'Split Mode', 'Map on left, Graph on right. What more do you want?'],
    [<MapIcon size={15} />, 'Map', 'Shows a map of the laps.'],
    [<Rows3 size={15} />, 'Individual Graphs', 'Instead of cramming all data into one graph, it splits them off into separate graphs.'],
    [<SyncedTooltipIcon size={15} />, 'Synced Tooltip', 'When hovering over the graph, the tooltip will show the data for all visible graphs at that point.'],
    [<Columns3 size={15} />, 'Sector Boundaries', 'Shows Sectors instead of Distance on the X Axis.'],
    [<ChartNoAxesCombined size={15} />, 'Sector Delta', 'Instead of whole lap delta, it splits the delta into sectors.'],
    [<ListChevronsUpDown size={15} />, 'Comparison', 'Compare two laps.'],
    [<Palette size={15} />, 'Map Layer', "Track Dominance colors each stretch by the faster lap. Driver Inputs shows braking, full and partial throttle, and coasting, one map per lap. Speed colours each lap from its slowest to its fastest point on one scale, one map per lap; hover a corner's mark for its apex speed. ERS Usage shows where each lap deployed ERS, one map per lap. Full colour is the car's peak MGU-K output in the recording for the grip it was driving in. ERS Harvest shows where each lap harvested energy, full colour at the car's peak harvest power."],
    [<Disc3 size={15} />, 'Braking Points', "Marks each corner's braking zone (dimmed) and acceleration zone on the racing line, in the colour of the lap that was quicker through it. Hover a zone to compare the two laps."],
    [<Gauge size={15} />, 'Data Comparison Panel', 'Shows or hides the steering, pedals, ERS, speed and gear panel on the map.'],
    [<SeparatorVertical size={15} />, 'Split Cursors', 'In Split Mode while comparing, shows where both cars are on the lap as lines on the graphs.'],
]
export const HELP_INTERACTIONS: [ReactNode, string, string][] = [
    [<ZoomIn size={15} />, 'Zoom', 'Ctrl + Wheel to Zoom'],
    [<ArrowLeft size={15} />, 'Pan', 'Click and Drag to Pan'],
    [<RotateCcw size={15} />, 'Reset', 'Double Right Click to Reset'],
    [<MapIcon size={15} />, 'Map View', 'Double Left Click to Open in Map view'],
]
