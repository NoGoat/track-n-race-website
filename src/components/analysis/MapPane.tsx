// The Analysis map (electron-frontend components/AnalyzeMapComparison.tsx and AnalyzeInputComparison.tsx):
// libtnrp's map layers and braking points for the laps on show, the Data Comparison panel, and the map's own
// playback bar in Comparison mode. Markup, classes and wording ported as written.
import { memo, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, GripVertical } from 'lucide-react'
import TrackMap, { useSize, type TrackMapMarker, type TrackMark } from './TrackMap'
import {
    channelAt, dominancePaint, ersPaint, fmtKw, harvestPaint, indexAtTime, inputsPaint, rampGradient, speedPaint,
    ERS_RAMP_DARK, HARVEST_RAMP_DARK, INPUT_COLORS_DARK, INPUT_STATE_LABELS, SPEED_RAMP_DARK, SUPERCLIP_COLOR_DARK,
    type LapInfo, type TourData, type TrackPaint,
} from './lib'

export type MapColoring = 'none' | 'dominance' | 'ers' | 'harvest' | 'inputs' | 'speed'

/** The tour reads the marks on show to point at one */
export const mapHooks: {
    marks: TrackMark[]; zoneCount: number; apexStart: number; map: any; pane: HTMLElement | null
    /** Moves the Data Comparison panel, as a drag would (0-1 across and down the map) */
    movePanel: ((position: { x: number; y: number }) => void) | null
} = { marks: [], zoneCount: 0, apexStart: 0, map: null, pane: null, movePanel: null }

/** libtnrp's result for `mode` over these laps; with one lap, its half of any pair. */
export function resolveMapResult(data: TourData, mode: string, current: number | null, comparison: number | null): any | null {
    if (current === null || !data.laps[current]) return null
    if (comparison !== null && comparison !== current && data.maps[`${current}-${comparison}`]) {
        return { ...data.maps[`${current}-${comparison}`][mode], hasCurrent: true, hasComparison: true }
    }
    const key = Object.keys(data.maps).find(k => k.startsWith(`${current}-`))
    if (!key) return null
    const r = data.maps[key][mode]
    if (mode === 'braking') return { braking: { ...r.braking, comparison: [], pairs: [] }, hasCurrent: true, hasComparison: false }
    if (mode === 'dominance') return null
    return { ...r, hasCurrent: true, hasComparison: false }
}

const LEGEND_CLASS = 'pointer-events-none absolute bottom-2 right-2 z-10 flex items-center text-[9px] font-mono text-[var(--text-secondary)]'

function ErsScale({ usage }: { usage: any }) {
    if (!usage || (!usage.restricted && !usage.usesNormal && !usage.usesReduced)) return null
    return <div className={`${LEGEND_CLASS} gap-1.5`}>
        {usage.restricted
            ? <span>No ERS data</span>
            : <>
                <span>0</span>
                <span className="h-1.5 w-16 rounded-full" style={{ background: rampGradient(ERS_RAMP_DARK) }} />
                {usage.usesNormal && <span className="text-[var(--text-primary)]">{fmtKw(usage.normalPeakKw)}</span>}
                {usage.usesReduced && <span>
                    {usage.usesNormal ? '· ' : ''}<span className="text-[var(--text-primary)]">{fmtKw(usage.reducedPeakKw)}</span> reduced grip
                </span>}
            </>}
    </div>
}
function HarvestScale({ harvest }: { harvest: any }) {
    if (!harvest || (!harvest.restricted && harvest.level.length === 0)) return null
    return <div className={`${LEGEND_CLASS} gap-1.5`}>
        {harvest.restricted
            ? <span>No ERS data</span>
            : <>
                <span>0</span>
                <span className="h-1.5 w-16 rounded-full" style={{ background: rampGradient(HARVEST_RAMP_DARK) }} />
                <span className="text-[var(--text-primary)]">{fmtKw(Math.round(harvest.peakKw))}</span>
                {harvest.superclip.some(Boolean) && <span className="ml-1 flex items-center gap-1">
                    <span className="h-1.5 w-3 rounded-full" style={{ background: SUPERCLIP_COLOR_DARK }} />
                    Superclip
                </span>}
            </>}
    </div>
}
function SpeedScale({ speed, minKph, maxKph }: { speed: any; minKph: number; maxKph: number }) {
    if (!speed || speed.speedKph.length === 0) return null
    return <div className={`${LEGEND_CLASS} gap-1.5`}>
        <span>{Math.round(minKph)}</span>
        <span className="h-1.5 w-16 rounded-full" style={{ background: rampGradient(SPEED_RAMP_DARK) }} />
        <span className="text-[var(--text-primary)]">{Math.round(maxKph)} km/h</span>
    </div>
}
function InputsLegend() {
    return <div className={`${LEGEND_CLASS} gap-2.5`}>
        {INPUT_STATE_LABELS.map((label, state) => <span key={label} className="flex items-center gap-1">
            <span className="h-1.5 w-3 rounded-full" style={{ background: INPUT_COLORS_DARK[state] }} />{label}
        </span>)}
    </div>
}

const APEX_MARK_M = 6
const formatM = (m: number) => `${Math.round(m).toLocaleString('en-US')} m`
const sideText = (side: number) => side < 0 ? ' · L' : side > 0 ? ' · R' : ''

function apexMarks(speed: any): TrackMark[] {
    if (!speed || !(speed.trackLengthM > 0)) return []
    const length = speed.trackLengthM
    return speed.apexes.map((apex: any, index: number) => ({
        fromFraction: Math.max(0, apex.distanceM - APEX_MARK_M) / length,
        toFraction: Math.min(length, apex.distanceM + APEX_MARK_M) / length,
        color: '#F4F5F8',
        tooltip: <div className="flex flex-col gap-0.5 whitespace-nowrap tabular-nums">
            <span className="text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">
                Apex {index + 1}{sideText(apex.side)} · {formatM(apex.distanceM)}
            </span>
            <span className="text-[12px] font-bold">{Math.round(apex.speedKph)} km/h</span>
        </div>,
    }))
}

const BRAKING_LEVEL_S = 0.01
const BRAKING_HALF_OPACITY = 0.45
const PHASE_MIN_M = 30
const CORNER_MATCH_M = 80
type BrakingPhase = 'braking' | 'acceleration' | null
const EXIT_OBSERVATIONS = new Set(['wheelspin', 'earlier_throttle_spin', 'earlier_throttle', 'faster_to_full'])

function brakingObservationText(o: any, labels: [string, string]): string {
    const lap = labels[o.lap], other = labels[1 - o.lap]
    switch (o.kind) {
        case 'quicker_despite_coast': return `${lap} is ${o.value.toFixed(3)} s quicker despite lifting ${o.other.toFixed(1)} s earlier`
        case 'apex_speed': return `${lap} carries ${Math.round(o.value - o.other)} km/h more through the apex (${Math.round(o.value)} vs ${Math.round(o.other)})`
        case 'later_but_slower': return `${lap} brakes ${Math.round(o.value)} m later but is ${o.other.toFixed(3)} s slower`
        case 'more_harvest': return `${lap} harvests ${Math.round(o.value - o.other)} kJ more than ${other}`
        case 'low_battery': return `${lap} starts the zone with a near-empty battery (${o.value.toFixed(2)} MJ)`
        case 'wheelspin': return `${lap} spins the rears on exit (${Math.round(o.value)}% for ${o.other.toFixed(1)} s)`
        case 'earlier_throttle_spin': return `${lap} is back on throttle ${Math.round(o.value)} m earlier but spins the rears (${Math.round(o.other)}%)`
        case 'earlier_throttle': return `${lap} is back on throttle ${Math.round(o.value)} m earlier than ${other}`
        case 'faster_to_full': return `${lap} is flat out ${Math.round(o.value)} m sooner than ${other}`
        case 'lift_only': return `${lap} takes it on a lift where ${other} brakes`
    }
    return ''
}
const brakeAtText = (p: any) => p.liftOnly ? `lift ${Math.round(p.distanceM).toLocaleString('en-US')} m` : formatM(p.distanceM)
const metresText = (m: number) => m < 0 ? '—' : `${Math.round(m).toLocaleString('en-US')} m`
const coastText = (p: any) => p.coastS > 0 ? `${p.coastS.toFixed(1)} s · ${Math.round(p.coastM)} m` : 'none'
const spinText = (p: any) => p.wheelspin ? `${Math.round(p.wheelspinPct)}% · ${p.wheelspinS.toFixed(1)} s` : 'none'
function alignCorners(a: any[], b: any[]) {
    const taken = new Set<number>()
    const rows: Array<[any, any]> = a.map(apex => {
        let best = -1, bestGap = CORNER_MATCH_M
        b.forEach((other, index) => { const gap = Math.abs(other.distanceM - apex.distanceM); if (!taken.has(index) && gap <= bestGap) { best = index; bestGap = gap } })
        if (best < 0) return [apex, undefined]
        taken.add(best)
        return [apex, b[best]]
    })
    b.forEach((apex, index) => { if (!taken.has(index)) rows.push([undefined, apex]) })
    return rows.sort((x, y) => (x[0] ?? x[1]).distanceM - (y[0] ?? y[1]).distanceM)
}
function exitBetter(a: number, b: number, aSpun: boolean, bSpun: boolean): 0 | 1 | null {
    if (a < 0 || b < 0 || (aSpun && bSpun)) return null
    if (aSpun !== bSpun) return aSpun ? 1 : 0
    return Math.abs(a - b) < 0.5 ? null : a < b ? 0 : 1
}

function BrakingTooltip({ zone, phase, fromM, splitM, toM, current, comparison, pair, currentLabel, comparisonLabel, currentColor, comparisonColor }: {
    zone: number; phase: BrakingPhase; fromM: number; splitM: number; toM: number
    current: any; comparison: any; pair: any
    currentLabel: string; comparisonLabel: string; currentColor: string; comparisonColor: string
}) {
    const braking = phase !== 'acceleration'
    const acceleration = phase !== 'braking'
    const both = current !== undefined && comparison !== undefined
    const times = !pair ? null
        : phase === 'braking' ? [pair.currentBrakingS, pair.comparisonBrakingS]
            : phase === 'acceleration' ? [pair.currentAccelerationS, pair.comparisonAccelerationS]
                : [pair.currentTimeS, pair.comparisonTimeS]
    const timed = times !== null && times[0] >= 0 && times[1] >= 0
    const quicker = timed ? times![1] - times![0] : 0
    const verdict = !timed ? null
        : Math.abs(quicker) < BRAKING_LEVEL_S ? { text: `Level through the ${braking && acceleration ? 'zone' : 'half'}`, color: undefined }
            : quicker > 0
                ? { text: `${currentLabel} ${Math.abs(quicker).toFixed(3)} s quicker`, color: currentColor }
                : { text: `${comparisonLabel} ${Math.abs(quicker).toFixed(3)} s quicker`, color: comparisonColor }
    type Better = 0 | 1 | null
    type Row = [string, string | null, string | null, Better, [boolean, boolean]?]
    const pick = (a: number, b: number, higher: boolean, margin = 0): Better => Math.abs(a - b) <= margin ? null : (a > b) === higher ? 0 : 1
    const known = (v: number | undefined) => v !== undefined && v >= 0
    const sameBrake = both && (pair?.sameBrakingPoint ?? true)
    const corners = alignCorners(current?.apexes ?? [], comparison?.apexes ?? []).filter(([a, b]) => {
        const at = (a ?? b).distanceM
        return splitM < 0 || (braking && at <= splitM) || (acceleration && at > splitM)
    })
    const rows: Row[] = [
        ...(braking ? [
            ['Brakes at', current ? brakeAtText(current) : null, comparison ? brakeAtText(comparison) : null,
                both && sameBrake ? pick(current.distanceM, comparison.distanceM, true, 0.5) : null],
            ['Braking', current ? metresText(current.brakingDistanceM) : null, comparison ? metresText(comparison.brakingDistanceM) : null,
                both && sameBrake && current.brakingDistanceM >= 0 && comparison.brakingDistanceM >= 0
                    ? pick(current.brakingDistanceM, comparison.brakingDistanceM, false, 0.5) : null],
            ['Entry', current ? `${Math.round(current.speedKph)} km/h` : null, comparison ? `${Math.round(comparison.speedKph)} km/h` : null,
                both && sameBrake ? pick(current.speedKph, comparison.speedKph, true, 0.5) : null],
            ['Coast', current ? coastText(current) : null, comparison ? coastText(comparison) : null, null],
        ] as Row[] : []),
        ...corners.map(([a, b], index): Row => [
            `${corners.length > 1 ? `Apex ${index + 1}` : 'Apex'}${sideText((a ?? b).side)}`,
            current ? (a ? `${Math.round(a.speedKph)} km/h` : '—') : null,
            comparison ? (b ? `${Math.round(b.speedKph)} km/h` : '—') : null,
            a && b ? pick(a.speedKph, b.speedKph, true, 0.5) : null,
        ]),
        ...(braking ? [
            ['ERS', known(pair?.currentHarvestKj) ? `+${Math.round(pair.currentHarvestKj).toLocaleString('en-US')} kJ` : null,
                known(pair?.comparisonHarvestKj) ? `+${Math.round(pair.comparisonHarvestKj).toLocaleString('en-US')} kJ` : null,
                pair && known(pair.currentHarvestKj) && known(pair.comparisonHarvestKj) ? pick(pair.currentHarvestKj, pair.comparisonHarvestKj, true, 0.5) : null],
        ] as Row[] : []),
        ...(acceleration ? [
            ['Throttle on', current ? metresText(current.throttleOnM) : null, comparison ? metresText(comparison.throttleOnM) : null,
                both ? exitBetter(current.throttleOnM, comparison.throttleOnM, current.wheelspin, comparison.wheelspin) : null,
                [!!current?.wheelspin && current.throttleOnM >= 0, !!comparison?.wheelspin && comparison.throttleOnM >= 0]],
            ['Full throttle', current ? metresText(current.fullThrottleM) : null, comparison ? metresText(comparison.fullThrottleM) : null,
                both ? exitBetter(current.fullThrottleM, comparison.fullThrottleM, current.wheelspin, comparison.wheelspin) : null],
            ['0 → 100%', current ? metresText(current.throttleToFullM) : null, comparison ? metresText(comparison.throttleToFullM) : null,
                both ? exitBetter(current.throttleToFullM, comparison.throttleToFullM, current.wheelspin, comparison.wheelspin) : null],
            ['Wheelspin', current ? spinText(current) : null, comparison ? spinText(comparison) : null,
                both && (current.wheelspin || comparison.wheelspin)
                    ? current.wheelspin && comparison.wheelspin ? pick(current.wheelspinPct, comparison.wheelspinPct, false, 0.5) : current.wheelspin ? 1 : 0
                    : null],
        ] as Row[] : []),
        ['Time', timed ? `${times![0].toFixed(3)} s` : null, timed ? `${times![1].toFixed(3)} s` : null, timed ? pick(times![0], times![1], false, BRAKING_LEVEL_S / 2) : null],
    ]
    const shown = rows.filter(([, a, b]) => a !== null || b !== null)
    const observations = (pair?.observations ?? [])
        .filter((o: any) => EXIT_OBSERVATIONS.has(o.kind) ? acceleration : braking)
        .map((o: any) => brakingObservationText(o, [currentLabel, comparisonLabel]))
    const [shownFrom, shownTo] = phase === 'braking' ? [fromM, splitM] : phase === 'acceleration' ? [splitM, toM] : [fromM, toM]
    const lapHead = (label: string, color: string, align: 'left' | 'right') =>
        <th className={`pb-1 text-[9px] font-bold ${align === 'left' ? 'text-left' : 'text-right'}`} style={{ color }}>{label}</th>
    const cell = (value: string | null, wins: boolean, warn: boolean, color: string, align: 'left' | 'right') =>
        <td className={`border-t border-[var(--border)] py-[3px] ${align === 'left' ? 'text-left' : 'text-right'} ${wins || warn ? 'font-bold' : ''} ${warn ? 'text-amber-500' : ''}`}
            style={wins && !warn ? { color } : undefined}>{value ?? '—'}</td>
    return <div className="flex w-[270px] flex-col gap-2 whitespace-nowrap tabular-nums">
        <div className="flex items-baseline justify-between gap-3 text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">
            <span>{phase === 'acceleration' ? 'Acceleration' : 'Braking'} zone {zone}{corners.length > 1 ? ` · ${corners.length} corners` : ''}</span>
            <span>{formatM(shownFrom)} – {formatM(shownTo)}</span>
        </div>
        {verdict && <div className="text-[12px] font-bold" style={verdict.color ? { color: verdict.color } : undefined}>{verdict.text}</div>}
        <table className="w-full border-collapse">
            <thead><tr>
                {current && lapHead(currentLabel, currentColor, 'left')}
                <th />
                {comparison && lapHead(comparisonLabel, comparisonColor, 'right')}
            </tr></thead>
            <tbody>
                {shown.map(([measure, a, b, better, warn]) => <tr key={measure}>
                    {current && cell(a, better === 0, warn?.[0] ?? false, currentColor, 'left')}
                    <td className="border-t border-[var(--border)] px-1.5 py-[3px] text-center text-[9px] text-[var(--text-secondary)]">{measure}</td>
                    {comparison && cell(b, better === 1, warn?.[1] ?? false, comparisonColor, 'right')}
                </tr>)}
            </tbody>
        </table>
        {observations.length > 0 && <div className="flex flex-col gap-1 whitespace-normal border-t border-[var(--border)] pt-1.5 leading-snug text-[var(--text-secondary)]">
            {observations.map((text: string) => <div key={text} className="flex gap-1.5">
                <span className="shrink-0 text-[var(--text-muted)]">▸</span><span className="min-w-0">{text}</span>
            </div>)}
        </div>}
    </div>
}

// ── Data Comparison panel (AnalyzeInputComparison.tsx) ───────────────────────
interface Sample { steering: number; brake: number; throttle: number; ers_pct: number; speed_kph: number; gear: number }
function sampleAt(lap: LapInfo | null, elapsed: number): Sample | null {
    if (!lap) return null
    const i = indexAtTime(lap.trace, Math.min(elapsed, lap.time))
    return {
        steering: channelAt(lap.trace, 'str', i), brake: channelAt(lap.trace, 'brk', i), throttle: channelAt(lap.trace, 'thr', i),
        ers_pct: channelAt(lap.trace, 'ers', i), speed_kph: channelAt(lap.trace, 'spd', i), gear: lap.trace.gear[Math.round(i)],
    }
}
function InputBars({ label, field, samples, colors, labels }: { label: string; field: 'steering' | 'brake' | 'throttle' | 'ers_pct'; samples: (Sample | null)[]; colors: string[]; labels: string[] }) {
    const signed = field === 'steering'
    return <div className="analyze-input-comparison__row">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <div className={`analyze-input-comparison__bars ${signed ? 'analyze-input-comparison__bars--signed' : ''}`}>
            {samples.map((sample, index) => {
                const raw = sample ? (field === 'ers_pct' ? sample.ers_pct / 100 : sample[field]) : null
                const value = raw === null ? null : Math.max(signed ? -1 : 0, Math.min(1, raw))
                const reading = value === null ? 'No data' : signed
                    ? `${value < 0 ? 'L ' : value > 0 ? 'R ' : ''}${Math.round(Math.abs(value) * 100)}%`
                    : `${Math.round(value * 100)}%`
                return <div key={index} className="analyze-input-comparison__lane" role="img" aria-label={`${labels[index]} ${label}: ${reading}`} title={`${labels[index]}: ${reading}`}>
                    {value === null
                        ? <span className="analyze-input-comparison__missing">—</span>
                        : <span className="analyze-input-comparison__fill" style={{
                            backgroundColor: colors[index],
                            left: `${signed ? 50 + Math.min(0, value) * 50 : 0}%`,
                            width: `${Math.abs(value) * (signed ? 50 : 100)}%`,
                        }} />}
                </div>
            })}
        </div>
    </div>
}

function InputComparison({ current, comparison, currentColor, comparisonColor, currentLabel, comparisonLabel, elapsedSource }: {
    current: LapInfo | null; comparison: LapInfo | null; currentColor: string; comparisonColor: string
    currentLabel: string; comparisonLabel: string; elapsedSource: () => number
}) {
    const [collapsed, setCollapsed] = useState(false)
    const [position, setPosition] = useState({ x: 0, y: 0 })
    useEffect(() => {
        mapHooks.movePanel = setPosition
        return () => { if (mapHooks.movePanel === setPosition) mapHooks.movePanel = null }
    }, [])
    const [dragging, setDragging] = useState(false)
    const panelRef = useRef<HTMLElement>(null)
    const dragRef = useRef<{ id: number; sx: number; sy: number; start: { x: number; y: number } } | null>(null)
    const contentId = useId()
    const [samples, setSamples] = useState<(Sample | null)[]>([null, null])
    useEffect(() => {
        if (collapsed) return
        const update = () => { const e = elapsedSource(); setSamples([sampleAt(current, e), sampleAt(comparison, e)]) }
        update()
        const timer = window.setInterval(update, 50)
        return () => window.clearInterval(timer)
    }, [collapsed, comparison, current, elapsedSource])
    const colors = [currentColor, comparisonColor]
    const labels = [currentLabel || 'Current lap', comparisonLabel || 'Comparison lap']
    const clampPos = (v: number) => Math.max(0, Math.min(1, v))
    return <section ref={panelRef} data-tour="data-panel" className="analyze-input-comparison" data-dragging={dragging} aria-label="Comparison"
        style={{
            left: `calc(${position.x * 100}% + ${8 - position.x * 16}px)`,
            top: `calc(${position.y * 100}% + ${8 - position.y * 16}px)`,
            transform: `translate(${-position.x * 100}%, ${-position.y * 100}%)`,
        }}>
        <div className="analyze-input-comparison__header">
            <button type="button" className="analyze-input-comparison__drag-handle"
                onPointerDown={event => {
                    dragRef.current = { id: event.pointerId, sx: event.clientX, sy: event.clientY, start: position }
                    event.currentTarget.setPointerCapture(event.pointerId)
                    setDragging(true)
                }}
                onPointerMove={event => {
                    const drag = dragRef.current, panel = panelRef.current, map = panel?.parentElement
                    if (!drag || drag.id !== event.pointerId || !panel || !map) return
                    setPosition({
                        x: clampPos(drag.start.x + (event.clientX - drag.sx) / Math.max(1, map.clientWidth - panel.offsetWidth - 16)),
                        y: clampPos(drag.start.y + (event.clientY - drag.sy) / Math.max(1, map.clientHeight - panel.offsetHeight - 16)),
                    })
                }}
                onPointerUp={() => { dragRef.current = null; setDragging(false) }}
                onPointerCancel={() => { if (dragRef.current) setPosition(dragRef.current.start); dragRef.current = null; setDragging(false) }}
                aria-label="Move comparison. Drag or use arrow keys; hold Shift for fine adjustments."
                title="Drag to move · Arrow keys to adjust position">
                <GripVertical size={12} aria-hidden="true" />
                <span>Data Comparison</span>
            </button>
            <button type="button" className="analyze-input-comparison__action" onClick={() => setCollapsed(c => !c)}
                aria-expanded={!collapsed} aria-controls={contentId}
                aria-label={collapsed ? 'Expand data comparison' : 'Collapse data comparison'}
                title={collapsed ? 'Expand data comparison' : 'Collapse data comparison'}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="M12 5v14" className="analyze-input-comparison__toggle-stroke" />
                </svg>
            </button>
        </div>
        <div id={contentId} className={`analyze-input-comparison__body ${collapsed ? '' : 'analyze-input-comparison__body--expanded'}`} aria-hidden={collapsed}>
            <div className="analyze-input-comparison__body-inner">
                <div className="analyze-input-comparison__content">
                    <InputBars label="Steering" field="steering" samples={samples} colors={colors} labels={labels} />
                    <InputBars label="Brake" field="brake" samples={samples} colors={colors} labels={labels} />
                    <InputBars label="Throttle" field="throttle" samples={samples} colors={colors} labels={labels} />
                    <InputBars label="ERS" field="ers_pct" samples={samples} colors={colors} labels={labels} />
                    {(['speed_kph', 'gear'] as const).map(field => {
                        const fieldLabel = field === 'speed_kph' ? 'Speed' : 'Gear'
                        const unit = field === 'speed_kph' ? 'km/h' : ''
                        return <div key={field} className="analyze-input-comparison__row">
                            <span className="text-[var(--text-secondary)]">{fieldLabel}</span>
                            <div className="analyze-input-comparison__values">
                                {samples.map((sample, index) => {
                                    const value = sample ? sample[field] : null
                                    const reading = value === null ? '—' : field === 'gear'
                                        ? value < 0 ? 'R' : value === 0 ? 'N' : String(Math.round(value))
                                        : String(Math.round(value))
                                    return <span key={index} style={{ color: colors[index] }}>{reading}</span>
                                })}
                                <span className="text-[9px] font-normal text-[var(--text-secondary)]">{unit}</span>
                            </div>
                        </div>
                    })}
                </div>
            </div>
        </div>
    </section>
}

function lapPosition(lap: LapInfo | null, elapsed: number): { x: number; z: number } | null {
    if (!lap) return null
    const i = indexAtTime(lap.trace, Math.max(0, Math.min(lap.time, elapsed)))
    return { x: channelAt(lap.trace, 'x', i), z: channelAt(lap.trace, 'z', i) }
}

export default memo(function MapPane({
    data, map, current, comparison, currentColor, comparisonColor, currentLabel, comparisonLabel,
    mapColoring, brakingPoints, showInputPanel, elapsedSource, fixedMode, fixedBar, onMarkHover,
}: {
    data: TourData; map: any
    current: LapInfo | null; comparison: LapInfo | null
    currentColor: string; comparisonColor: string; currentLabel: string; comparisonLabel: string
    mapColoring: MapColoring; brakingPoints: boolean; showInputPanel: boolean
    elapsedSource: () => number
    fixedMode: boolean
    /** The map's own playback bar, shown in Comparison mode */
    fixedBar: ReactNode
    onMarkHover: (kind: 'zone' | 'apex' | null) => void
}) {
    const comparisonSelected = !!comparison
    const result = useMemo(() => mapColoring === 'none' ? null
        : resolveMapResult(data, mapColoring, current?.lap ?? null, comparison?.lap ?? null), [comparison, current, data, mapColoring])
    const brakingResult = useMemo(() => brakingPoints ? resolveMapResult(data, 'braking', current?.lap ?? null, comparison?.lap ?? null) : null,
        [brakingPoints, comparison, current, data])
    const ersMode = mapColoring === 'ers', inputsMode = mapColoring === 'inputs', harvestMode = mapColoring === 'harvest', speedMode = mapColoring === 'speed'
    const currentSpeed = speedMode && result?.hasCurrent ? result.current : null
    const comparisonSpeed = speedMode && result?.hasComparison ? result.comparison : null
    const currentHarvest = harvestMode && result?.hasCurrent ? result.current : null
    const comparisonHarvest = harvestMode && result?.hasComparison ? result.comparison : null
    const currentUsage = ersMode && result?.hasCurrent ? result.current : null
    const comparisonUsage = ersMode && result?.hasComparison ? result.comparison : null
    const [trackPaint, comparisonTrackPaint] = useMemo<[TrackPaint | null, TrackPaint | null]>(() => {
        if (!result) return [null, null]
        switch (mapColoring) {
            case 'dominance': return [dominancePaint(result, currentColor, comparisonColor), null]
            case 'harvest': return [result.hasCurrent ? harvestPaint(result.current) : null, result.hasComparison ? harvestPaint(result.comparison) : null]
            case 'inputs': return [result.hasCurrent ? inputsPaint(result.current) : null, result.hasComparison ? inputsPaint(result.comparison) : null]
            case 'speed': return [result.hasCurrent ? speedPaint(result.current, result.min, result.max) : null, result.hasComparison ? speedPaint(result.comparison, result.min, result.max) : null]
            case 'ers': return [result.hasCurrent ? ersPaint(result.current) : null, result.hasComparison ? ersPaint(result.comparison) : null]
        }
        return [null, null]
    }, [comparisonColor, currentColor, mapColoring, result])
    const separateMaps = (ersMode || harvestMode || inputsMode || speedMode) && comparisonSelected
    const legend = (usage: any, harvest: any, speed: any) => ersMode
        ? <ErsScale usage={usage} />
        : harvestMode ? <HarvestScale harvest={harvest} />
            : speedMode && result ? <SpeedScale speed={speed} minKph={result.min} maxKph={result.max} />
                : inputsMode && result ? <InputsLegend /> : null
    const peakMismatches: string[] = separateMaps && currentUsage && comparisonUsage
        ? [
            result?.normalPeakMismatch && `normal grip ${currentLabel} ${fmtKw(currentUsage.normalPeakKw)}, ${comparisonLabel} ${fmtKw(comparisonUsage.normalPeakKw)}`,
            result?.reducedPeakMismatch && `reduced grip ${currentLabel} ${fmtKw(currentUsage.reducedPeakKw)}, ${comparisonLabel} ${fmtKw(comparisonUsage.reducedPeakKw)}`,
        ].filter((t): t is string => typeof t === 'string')
        : separateMaps && currentHarvest && comparisonHarvest && result?.harvestPeakMismatch
            ? [`harvest ${currentLabel} ${fmtKw(Math.round(currentHarvest.peakKw))}, ${comparisonLabel} ${fmtKw(Math.round(comparisonHarvest.peakKw))}`]
            : []

    const brakingMarks = useMemo<TrackMark[] | null>(() => {
        const braking = brakingResult?.hasCurrent ? brakingResult.braking : null
        if (!braking || !(braking.trackLengthM > 0)) return null
        const length = braking.trackLengthM
        const level = '#E9EAEE'
        const tooltip = (zone: number, a: any, b: any, pair: any) => (phase: BrakingPhase, fromM: number, splitM: number, toM: number) =>
            <BrakingTooltip zone={zone} phase={phase} fromM={fromM} splitM={splitM} toM={toM} current={a} comparison={b} pair={pair}
                currentLabel={currentLabel} comparisonLabel={comparisonLabel} currentColor={currentColor} comparisonColor={comparisonColor} />
        const winner = (cs: number, ps: number) => {
            if (cs < 0 || ps < 0) return level
            const q = ps - cs
            return Math.abs(q) < BRAKING_LEVEL_S ? level : q > 0 ? currentColor : comparisonColor
        }
        const halves = (fromM: number, splitM: number, toM: number, brakingColor: string, accelerationColor: string,
            card: (phase: BrakingPhase, fromM: number, splitM: number, toM: number) => ReactNode): TrackMark[] =>
            splitM < 0
                ? [{ fromFraction: fromM / length, toFraction: toM / length, color: accelerationColor, tooltip: card(null, fromM, splitM, toM) }]
                : [{ fromFraction: fromM / length, toFraction: splitM / length, color: brakingColor, opacity: BRAKING_HALF_OPACITY, tooltip: card('braking', fromM, splitM, toM) },
                    { fromFraction: splitM / length, toFraction: toM / length, color: accelerationColor, tooltip: card('acceleration', fromM, splitM, toM) }]
        if (braking.comparison.length === 0)
            return braking.current.flatMap((point: any, index: number) => {
                const toM = Math.max(point.distanceM, point.endM)
                const split = point.minSpeedM - point.distanceM >= PHASE_MIN_M && toM - point.minSpeedM >= PHASE_MIN_M ? point.minSpeedM : -1
                return halves(point.distanceM, split, toM, currentColor, currentColor, tooltip(index + 1, point, undefined, undefined))
            })
        return braking.pairs.flatMap((pair: any) => halves(pair.fromM, pair.splitM, pair.toM,
            winner(pair.currentBrakingS, pair.comparisonBrakingS),
            pair.splitM < 0 ? winner(pair.currentTimeS, pair.comparisonTimeS) : winner(pair.currentAccelerationS, pair.comparisonAccelerationS),
            tooltip(pair.current + 1, braking.current[pair.current], braking.comparison[pair.comparison], pair)))
    }, [brakingResult, comparisonColor, comparisonLabel, currentColor, currentLabel])
    const currentMarks = useMemo<TrackMark[] | null>(() => {
        const apexes = apexMarks(currentSpeed)
        return apexes.length > 0 ? [...(brakingMarks ?? []), ...apexes] : brakingMarks
    }, [brakingMarks, currentSpeed])
    const comparisonMarks = useMemo<TrackMark[] | null>(() => {
        if (!separateMaps) return null
        const apexes = apexMarks(comparisonSpeed)
        return apexes.length > 0 ? [...(brakingMarks ?? []), ...apexes] : brakingMarks
    }, [brakingMarks, comparisonSpeed, separateMaps])

    const { ref: mapsRef, width: mapsWidth, height: mapsHeight } = useSize<HTMLDivElement>()
    const currentPaneRef = useRef<HTMLDivElement>(null)
    const stackMaps = mapsHeight > mapsWidth
    mapHooks.marks = currentMarks ?? []
    mapHooks.zoneCount = brakingMarks?.length ?? 0
    mapHooks.apexStart = brakingMarks?.length ?? 0
    mapHooks.map = map
    mapHooks.pane = currentPaneRef.current

    const markersFor = (withCurrent: boolean, withComparison: boolean) => (): TrackMapMarker[] => {
        const elapsed = elapsedSource()
        const out: TrackMapMarker[] = []
        const a = withCurrent ? lapPosition(current, elapsed) : null
        const b = withComparison ? lapPosition(comparison, elapsed) : null
        if (a) out.push({ ...a, label: currentLabel, color: currentColor })
        if (b) out.push({ ...b, label: comparisonLabel, color: comparisonColor })
        return out
    }
    const hoverKind = (marks: TrackMark[] | null) => (index: number | null) =>
        onMarkHover(index === null ? null : index >= (brakingMarks?.length ?? 0) && (marks?.length ?? 0) > (brakingMarks?.length ?? 0) ? 'apex' : 'zone')

    const mapEl = <TrackMap map={map} trackPaint={trackPaint} trackMarks={currentMarks}
        markerSource={separateMaps ? markersFor(true, false) : markersFor(true, true)} onMarkHover={hoverKind(currentMarks)} />
    const comparisonMapEl = separateMaps && <TrackMap map={map} trackPaint={comparisonTrackPaint} trackMarks={comparisonMarks}
        markerSource={markersFor(false, true)} onMarkHover={hoverKind(comparisonMarks)} />

    return <div className="h-full min-h-0 flex flex-col">
        <div ref={mapsRef} data-tour="maps" className="flex-1 min-h-0 relative">
            {separateMaps
                ? <div className={`absolute inset-0 flex ${stackMaps ? 'flex-col' : ''}`}>
                    <div ref={currentPaneRef} className="relative flex-1 min-w-0 min-h-0">
                        {mapEl}
                        {legend(currentUsage, currentHarvest, currentSpeed)}
                    </div>
                    <div className={`shrink-0 bg-[var(--border)] ${stackMaps ? 'h-px' : 'w-px'}`} />
                    <div className="relative flex-1 min-w-0 min-h-0">
                        {comparisonMapEl}
                        {legend(comparisonUsage, comparisonHarvest, comparisonSpeed)}
                    </div>
                </div>
                : <div ref={currentPaneRef} className="absolute inset-0">
                    {mapEl}
                    {legend(currentUsage, currentHarvest, currentSpeed)}
                </div>}
            {peakMismatches.length > 0 && <div role="status"
                className="pointer-events-none absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-[var(--bg-panel)] px-2 py-1 text-[10px] text-[var(--text-primary)]">
                <AlertTriangle size={12} className="shrink-0 text-amber-500" />
                <span>Peak MGU-K differs: {peakMismatches.join('; ')}</span>
            </div>}
            {showInputPanel && <InputComparison current={current} comparison={comparison} currentColor={currentColor} comparisonColor={comparisonColor}
                currentLabel={currentLabel} comparisonLabel={comparisonLabel} elapsedSource={elapsedSource} />}
        </div>
        <div className={`analyze-map-playback-bar ${fixedMode ? 'analyze-map-playback-bar--visible' : ''}`} aria-hidden={!fixedMode}>
            <div className="analyze-map-playback-bar__inner">{fixedBar}</div>
        </div>
    </div>
})
