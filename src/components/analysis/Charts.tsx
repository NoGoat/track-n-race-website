// Analysis charts (electron-frontend components/charts/AnalyzeTimeChart.tsx and lib/timechart/axisPlugin.ts),
// drawn with Canvas 2D instead of the app's WebGL TimeChart fork, to the same layout: stacked panels (or one
// shared panel), the comparison lap blended into the background, delta in its two colours, sector ticks,
// series-coloured y labels, and the playback cursor.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSize } from './TrackMap'
import { canvasDpr, useCanvasBoost } from './camera'
import {
    COMBINED_BY_ID, METRIC_BY_ID, TYRE_CORNERS, blendColor, channelAt, cornerKeyOf, indexAtTime, seriesLineColor, seriesMemberIds,
    seriesScaleDef, timeAtDistance, type LapInfo, type SeriesConfig,
} from './lib'

const Y_TICKS = [0, 0.25, 0.5, 0.75, 1]
const STACKED_TOP_PADDING = 6
const TOP_PADDING = 16
const STACKED_PANEL_GAP = 10
const AXIS = '#7c8098'
const GRID = 'rgba(255,255,255,0.04)'
const BORDER = '#1e2136'
const FONT = '10px "Cascadia Code", ui-monospace, monospace'

export interface ChartProps {
    series: SeriesConfig[]
    current: LapInfo | null
    comparison: LapInfo | null
    delta: { max: number; samples: [number, number, number][] } | null
    stacked: boolean
    sectorBoundaries: boolean
    sectorDelta: boolean
    syncedTooltip: boolean
    trackLength: number
    xRange: [number, number] | null
    elapsedSource: () => number
    showMapCursors: boolean
    mapCurrentColor: string
    mapComparisonColor: string
    currentLabel: string
    comparisonLabel: string
    onInspect?: (elapsedSeconds: number) => void
    /** No empty-state text: the run is still building the screen */
    quiet?: boolean
}

/** The run reads where a metric's chart is, to look at it */
export const chartHooks: { panelRect: ((metricId: string) => DOMRect | null) | null } = { panelRect: null }

const fmtDistance = (m: number) => `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`
function niceTicks(min: number, max: number, count: number): number[] {
    const raw = (max - min) / Math.max(1, count)
    const mag = 10 ** Math.floor(Math.log10(raw))
    const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) ?? raw
    const out: number[] = []
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v)
    return out
}

/** A series' y range: the metric's own, grown to fit the laps where they run past it (the app's expanding
 *  fixed ranges); fuel tops out at the laps' most fuel + 1 kg */
function seriesRange(item: SeriesConfig, laps: (LapInfo | null)[]): [number, number] {
    const def = seriesScaleDef(item.metricId)!
    let lo = Infinity, hi = -Infinity
    for (const id of seriesMemberIds(item)) {
        const member = METRIC_BY_ID.get(id)!
        for (const lap of laps) {
            if (!lap) continue
            for (let i = 0; i < lap.trace.d.length; i++) {
                const v = member.value(lap.trace, i)
                // Channels a car didn't send (an AI car's ride heights) are null
                if (!Number.isFinite(v)) continue
                if (v < lo) lo = v
                if (v > hi) hi = v
            }
        }
    }
    if (!(hi >= lo)) return [def.min, def.max]
    if (def.fitMax) return [def.min, Math.ceil(hi) + 1]
    return [Math.min(def.min, Math.floor(lo)), Math.max(def.max, Math.ceil(hi))]
}

/** Delta per sample, reset at each sector start when Sector Delta is on. As in the app, each sector is a run of its
 *  own: a [NaN, NaN] point separates them, so the line breaks at the boundary instead of jumping back to zero. */
function deltaPoints(delta: ChartProps['delta'], sectorEnds: number[], sectorDelta: boolean): [number, number][] {
    if (!delta) return []
    const pts = delta.samples.filter(s => s[2]).map(([d, v]) => [d, v] as [number, number])
    if (!sectorDelta) return pts
    const starts = [0, ...sectorEnds.slice(0, -1)]
    const base = starts.map(start => {
        const first = pts.find(([d]) => d >= start)
        return first ? first[1] : 0
    })
    const out: [number, number][] = []
    let previous = -1
    for (const [d, v] of pts) {
        const sector = starts.reduce((acc, start, i) => d >= start ? i : acc, 0)
        if (previous >= 0 && sector !== previous) out.push([NaN, NaN])
        out.push([d, v - base[sector]])
        previous = sector
    }
    return out
}

/** The app's chart tooltip (hooks/useChartTooltip.ts): beside the cursor on whichever side has room, clamped inside */
const TOOLTIP_GAP = 16
const TOOLTIP_PAD = 4
type TooltipRow = { label: string; color: string; value: string }
type TooltipState = { x: number; y: number; title: string; groups: { heading: string; rows: TooltipRow[] }[]; delta: { value: string; color: string } | null }

export default function Charts(props: ChartProps) {
    const { ref, width, height } = useSize<HTMLDivElement>()
    const baseRef = useRef<HTMLCanvasElement>(null)
    const overlayRef = useRef<HTMLCanvasElement>(null)
    const geometryRef = useRef<any>(null)
    const hoverRef = useRef<number | null>(null)
    const [tooltip, setTooltip] = useState<TooltipState | null>(null)
    const tooltipRef = useRef<HTMLDivElement>(null)
    // Placed once it has laid out, from its measured size (the app's placeTooltip)
    useLayoutEffect(() => {
        const el = tooltipRef.current
        if (!el || !tooltip) return
        const w = el.offsetWidth, h = el.offsetHeight
        const left = tooltip.x <= width / 2 ? tooltip.x + TOOLTIP_GAP : tooltip.x - TOOLTIP_GAP - w
        const top = tooltip.y <= height / 2 ? tooltip.y + TOOLTIP_GAP : tooltip.y - TOOLTIP_GAP - h
        el.style.left = `${Math.max(TOOLTIP_PAD, Math.min(left, Math.max(TOOLTIP_PAD, width - w - TOOLTIP_PAD)))}px`
        el.style.top = `${Math.max(TOOLTIP_PAD, Math.min(top, Math.max(TOOLTIP_PAD, height - h - TOOLTIP_PAD)))}px`
        el.style.visibility = 'visible'
    }, [tooltip, width, height])
    const propsRef = useRef(props)
    propsRef.current = props
    const boost = useCanvasBoost()
    // A metric's panel on screen, its axis labels and sector ticks included
    chartHooks.panelRect = metricId => {
        const g = geometryRef.current, canvas = baseRef.current
        if (!g || !canvas) return null
        const index = g.panels.findIndex((p: SeriesConfig) => p.metricId === metricId)
        if (index < 0) return null
        const r = g.panelRects[stacked ? index : 0]
        const box = canvas.getBoundingClientRect()
        const scale = box.width / (canvas.offsetWidth || box.width)
        const bottom = index === g.panels.length - 1 || !stacked ? g.plotBottom + 18 : r.bottom + 4
        return new DOMRect(box.left, box.top + (r.top - 4) * scale, box.width, (bottom - r.top + 4) * scale)
    }

    const { series, current, comparison, delta, stacked, sectorBoundaries, sectorDelta, trackLength, xRange } = props
    const sectorEnds = current ? [current.s1EndM, current.s2EndM, trackLength] : [trackLength / 3, (trackLength * 2) / 3, trackLength]
    const panels = series.filter(item => item.visible && (item.metricId === 'delta' ? !!comparison && !!delta : seriesMemberIds(item).length > 0))
    const hasVisible = panels.length > 0 && !!current

    // A lap arriving draws in from the left
    useEffect(() => {
        if (!current || matchMedia('(prefers-reduced-motion: reduce)').matches) return
        baseRef.current?.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
            { duration: 1100, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' })
    }, [current?.key, comparison?.key]) // eslint-disable-line react-hooks/exhaustive-deps

    // The static layer: grid, axes and lines
    useEffect(() => {
        const canvas = baseRef.current
        if (!canvas || !width || !height) return
        const dpr = canvasDpr(width, height)
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
        const ctx = canvas.getContext('2d')!
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, width, height)
        if (!hasVisible) { geometryRef.current = null; return }
        const left = panels.some(p => p.showYAxis) ? 48 : 12
        const top = stacked ? STACKED_TOP_PADDING : TOP_PADDING
        const plotLeft = left, plotRight = width - 12, plotTop = top, plotBottom = height - 24
        const [xMin, xMax] = xRange ?? [0, trackLength]
        const X = (d: number) => plotLeft + ((d - xMin) / (xMax - xMin)) * (plotRight - plotLeft)
        const xTicks = sectorBoundaries
            ? [xMin, ...sectorEnds.filter(v => v > xMin && v < xMax), xMax].filter((v, i, a) => i === 0 || Math.abs(v - a[i - 1]) > 1e-6)
            : niceTicks(xMin, xMax, Math.max(2, Math.floor((plotRight - plotLeft) / 80)))
        const xFormat = sectorBoundaries
            ? (v: number) => { const i = sectorEnds.findIndex(end => Math.abs(end - v) < 1e-3); return i >= 0 ? `S${i + 1}` : '' }
            : fmtDistance
        const n = stacked ? panels.length : 1
        const panelRects = Array.from({ length: n }, (_, i) => {
            const pTop = plotTop + (i / n) * (plotBottom - plotTop)
            const pBottom = plotTop + ((i + 1) / n) * (plotBottom - plotTop) - (i < n - 1 && stacked ? STACKED_PANEL_GAP : 0)
            return { top: pTop, bottom: pBottom }
        })
        // Labels sit at quarter steps of the range, so it rounds up to a step with one decimal at each tick
        const deltaRange = Math.max(0.2, Math.ceil((delta?.max ?? 0.5) / 0.2) * 0.2)
        const dPts = deltaPoints(delta, sectorEnds, sectorDelta)
        const ranges = new Map(panels.filter(p => p.metricId !== 'delta').map(p => [p.metricId, seriesRange(p, [current, comparison])]))
        geometryRef.current = { plotLeft, plotRight, plotTop, plotBottom, xMin, xMax, panelRects, panels, deltaRange, dPts }

        // Grid
        ctx.strokeStyle = GRID
        ctx.lineWidth = 1
        ctx.beginPath()
        for (const r of panelRects) {
            for (const t of xTicks) { const x = Math.round(X(t)) + 0.5; ctx.moveTo(x, r.top); ctx.lineTo(x, r.bottom) }
            for (const t of Y_TICKS) { const y = Math.round(r.bottom - t * (r.bottom - r.top)) + 0.5; ctx.moveTo(plotLeft, y); ctx.lineTo(plotRight, y) }
        }
        ctx.stroke()

        // Lines, each panel clipped to itself
        const drawMetric = (r: { top: number; bottom: number }, item: SeriesConfig) => {
            ctx.save()
            ctx.beginPath()
            ctx.rect(plotLeft, r.top - 1, plotRight - plotLeft, r.bottom - r.top + 2)
            ctx.clip()
            const Y = (n: number) => r.bottom - Math.max(0, Math.min(1, n)) * (r.bottom - r.top)
            if (item.metricId === 'delta') {
                ctx.lineWidth = 2
                ctx.lineJoin = 'round'
                for (let i = 1; i < dPts.length; i++) {
                    const [d0, v0] = dPts[i - 1], [d1, v1] = dPts[i]
                    if (!Number.isFinite(v0) || !Number.isFinite(v1)) continue
                    ctx.beginPath()
                    ctx.strokeStyle = (v0 + v1) / 2 >= 0 ? item.color : item.negativeColor ?? '#37872D'
                    ctx.moveTo(X(d0), Y(0.5 + v0 / (2 * deltaRange)))
                    ctx.lineTo(X(d1), Y(0.5 + v1 / (2 * deltaRange)))
                    ctx.stroke()
                }
            } else {
                const [min, max] = ranges.get(item.metricId)!
                const norm = (v: number) => (v - min) / (max - min)
                // A combined card draws each picked corner, every comparison line under the current ones
                const members = seriesMemberIds(item)
                for (const [lap, role, id] of [
                    ...members.map(id => [comparison, 'comparison', id] as const), ...members.map(id => [current, 'current', id] as const),
                ]) {
                    if (!lap) continue
                    const def = METRIC_BY_ID.get(id)!
                    const color = seriesLineColor(item, id)
                    const t = lap.trace
                    ctx.beginPath()
                    ctx.strokeStyle = role === 'comparison' ? blendColor(color) : color
                    ctx.lineWidth = role === 'comparison' ? 1.25 : 1.75
                    ctx.lineJoin = 'round'
                    let prevY = 0, started = false
                    for (let i = 0; i < t.d.length; i++) {
                        const v = def.value(t, i)
                        // No line where the car didn't send the channel
                        if (!Number.isFinite(v)) { started = false; continue }
                        const x = X(t.d[i]), y = Y(norm(v))
                        if (!started) { ctx.moveTo(x, y); started = true }
                        else if (def.step) { ctx.lineTo(x, prevY); ctx.lineTo(x, y) }
                        else ctx.lineTo(x, y)
                        prevY = y
                    }
                    ctx.stroke()
                }
            }
            ctx.restore()
        }
        if (stacked) panels.forEach((item, i) => drawMetric(panelRects[i], item))
        else panels.forEach(item => drawMetric(panelRects[0], item))

        // Labels and borders
        ctx.font = FONT
        ctx.textBaseline = 'top'
        ctx.textAlign = 'center'
        ctx.fillStyle = AXIS
        for (const t of xTicks) ctx.fillText(xFormat(t), X(t), plotBottom + 2)
        ctx.textBaseline = 'middle'
        ctx.textAlign = 'right'
        const axisItems = stacked ? panels.map((item, i) => [item, panelRects[i]] as const) : panels.length ? [[panels[0], panelRects[0]] as const] : []
        for (const [item, r] of axisItems) {
            if (!item.showYAxis) continue
            const isDelta = item.metricId === 'delta'
            const def = seriesScaleDef(item.metricId)
            const [min, max] = ranges.get(item.metricId) ?? [0, 1]
            for (const t of Y_TICKS) {
                ctx.fillStyle = isDelta ? (t < 0.5 ? item.negativeColor ?? '#37872D' : t > 0.5 ? item.color : AXIS) : item.color
                const text = isDelta ? `${((t - 0.5) * 2 * deltaRange).toFixed(1)}s` : def ? def.axisFormat(min + t * (max - min)) : ''
                ctx.fillText(text, plotLeft - 4, r.bottom - t * (r.bottom - r.top))
            }
        }
        ctx.strokeStyle = BORDER
        ctx.beginPath()
        for (const r of panelRects) {
            ctx.moveTo(plotLeft + 0.5, r.top); ctx.lineTo(plotLeft + 0.5, r.bottom)
            ctx.moveTo(plotLeft, Math.round(r.bottom) + 0.5); ctx.lineTo(plotRight, Math.round(r.bottom) + 0.5)
        }
        ctx.stroke()
    }, [comparison, current, delta, hasVisible, height, panels.map(p => `${p.metricId}${p.color}${p.negativeColor}${p.showYAxis}${p.corners}${JSON.stringify(p.cornerColors)}`).join('|'), sectorBoundaries, sectorDelta, stacked, trackLength, width, xRange?.[0], xRange?.[1], boost]) // eslint-disable-line react-hooks/exhaustive-deps

    // The moving layer: playback cursors and the hover crosshair
    useEffect(() => {
        const canvas = overlayRef.current
        if (!canvas || !width || !height) return
        const dpr = canvasDpr(width, height)
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
        const ctx = canvas.getContext('2d')!
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        let frame = 0
        const loop = () => {
            ctx.clearRect(0, 0, width, height)
            const g = geometryRef.current
            const p = propsRef.current
            if (g && p.current) {
                const X = (d: number) => g.plotLeft + ((d - g.xMin) / (g.xMax - g.xMin)) * (g.plotRight - g.plotLeft)
                const elapsed = p.elapsedSource()
                const line = (d: number, color: string, dash: number[]) => {
                    const x = Math.round(X(d)) + 0.5
                    if (x < g.plotLeft || x > g.plotRight) return
                    ctx.beginPath()
                    ctx.setLineDash(dash)
                    ctx.strokeStyle = color
                    ctx.lineWidth = 1
                    ctx.moveTo(x, g.plotTop)
                    ctx.lineTo(x, g.plotBottom)
                    ctx.stroke()
                }
                const at = (lap: LapInfo) => channelAt(lap.trace, 'd', indexAtTime(lap.trace, Math.min(elapsed, lap.time)))
                if (p.showMapCursors) {
                    if (p.comparison) line(at(p.comparison), p.mapComparisonColor, [2, 4])
                    line(at(p.current), p.mapCurrentColor, [2, 4])
                } else line(at(p.current), 'rgba(226,228,236,0.55)', [2, 4])
                if (hoverRef.current !== null) line(hoverRef.current, 'rgba(255,255,255,0.22)', [])
                ctx.setLineDash([])
            }
            frame = requestAnimationFrame(loop)
        }
        frame = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(frame)
    }, [height, width, boost])

    const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
        const g = geometryRef.current
        if (!g || !current) return
        const rect = event.currentTarget.getBoundingClientRect()
        const scale = rect.width / (event.currentTarget.offsetWidth || rect.width)
        const x = (event.clientX - rect.left) / scale, y = (event.clientY - rect.top) / scale
        if (x < g.plotLeft || x > g.plotRight || y < g.plotTop || y > g.plotBottom) { hoverRef.current = null; setTooltip(null); return }
        const d = g.xMin + ((x - g.plotLeft) / (g.plotRight - g.plotLeft)) * (g.xMax - g.xMin)
        hoverRef.current = d
        const panelIndex = stacked ? g.panelRects.findIndex((r: any) => y >= r.top && y <= r.bottom + STACKED_PANEL_GAP) : 0
        const shown = stacked && !props.syncedTooltip ? (panelIndex >= 0 ? [panels[panelIndex]] : []) : panels
        const valueAt = (lap: LapInfo, id: string) => {
            const def = METRIC_BY_ID.get(id)!
            const i = Math.round(indexAtTime(lap.trace, timeAtDistance(lap.trace, d)))
            const v = def.value(lap.trace, i)
            return Number.isFinite(v) ? def.format(v) : '—'
        }
        // As in the app (AnalyzeTimeChart's move): a heading per lap with its metrics under it, the comparison's
        // names in their blended colours, then the delta
        const metrics = shown.filter(item => item && item.metricId !== 'delta')
        const group = (lap: LapInfo | null, heading: string, blended: boolean) => {
            if (!lap) return null
            const rows = metrics.flatMap(item => {
                const combined = COMBINED_BY_ID.get(item.metricId)
                return seriesMemberIds(item).map(id => {
                    const corner = combined && TYRE_CORNERS.find(c => c.key === cornerKeyOf(item.metricId, id))
                    const color = seriesLineColor(item, id)
                    return {
                        label: corner ? `${combined.shortLabel} ${corner.label}` : METRIC_BY_ID.get(id)!.label,
                        color: blended ? blendColor(color) : color, value: valueAt(lap, id),
                    }
                })
            })
            return rows.length ? { heading, rows } : null
        }
        const groups = [group(current, props.currentLabel, false), group(comparison, props.comparisonLabel, true)]
            .filter((g): g is { heading: string; rows: TooltipRow[] } => !!g)
        let deltaRow: TooltipState['delta'] = null
        const deltaItem = shown.find(item => item?.metricId === 'delta')
        if (deltaItem) {
            // The nearest sample, skipping the breaks between sectors
            let best: [number, number] | null = null
            for (const pt of g.dPts as [number, number][]) {
                if (Number.isFinite(pt[1]) && (!best || Math.abs(pt[0] - d) < Math.abs(best[0] - d))) best = pt
            }
            if (best) {
                const v = best[1]
                deltaRow = { value: `${v >= 0 ? '+' : ''}${v.toFixed(3)} s`, color: v >= 0 ? deltaItem.color : deltaItem.negativeColor ?? '#37872D' }
            }
        }
        if (!groups.length && !deltaRow) { setTooltip(null); return }
        setTooltip({ x, y: y + 4, title: `${Math.round(d)} m`, groups, delta: deltaRow })
    }

    return <div ref={ref} className="absolute inset-0 overflow-hidden" data-tour="charts"
        onMouseMove={handleMove} onMouseLeave={() => { hoverRef.current = null; setTooltip(null) }}
        onDoubleClick={() => { if (hoverRef.current !== null && current) props.onInspect?.(timeAtDistance(current.trace, hoverRef.current)) }}>
        <div aria-hidden={hasVisible}
            className={`analysis-chart-empty-state pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-[10px] uppercase tracking-widest text-[var(--text-secondary)] ${hasVisible || props.quiet ? '' : 'analysis-chart-empty-state--visible'}`}>
            {current ? 'No visible metrics' : 'No lap selected'}
        </div>
        <canvas ref={baseRef} className="absolute inset-0 w-full h-full" />
        <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        {tooltip && <div ref={tooltipRef}
            className="pointer-events-none absolute z-20 whitespace-nowrap font-mono text-[var(--text-primary)]"
            style={{
                visibility: 'hidden', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 4,
                fontSize: 12, padding: '6px 10px', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            }}>
            <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{tooltip.title}</div>
            {tooltip.groups.map((group, gi) => <div key={gi}>
                <div style={{ color: 'var(--text-secondary)', fontSize: 10, margin: `${gi > 0 ? 5 : 0}px 0 2px` }}>{group.heading}</div>
                {group.rows.map(row => <div key={row.label}><span style={{ color: row.color }}>{row.label}</span>: {row.value}</div>)}
            </div>)}
            {tooltip.delta && <div style={{ marginTop: 5 }}><span style={{ color: tooltip.delta.color }}>Delta</span>: {tooltip.delta.value}</div>}
        </div>}
    </div>
}
