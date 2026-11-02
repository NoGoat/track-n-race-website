// Analysis charts (electron-frontend components/charts/AnalyzeTimeChart.tsx and lib/timechart/axisPlugin.ts),
// drawn with Canvas 2D instead of the app's WebGL TimeChart fork, to the same layout: stacked panels (or one
// shared panel), the comparison lap blended into the background, delta in its two colours, sector ticks,
// series-coloured y labels, and the playback cursor.
import { useEffect, useRef, useState } from 'react'
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
                if (v < lo) lo = v
                if (v > hi) hi = v
            }
        }
    }
    if (!(hi >= lo)) return [def.min, def.max]
    if (def.fitMax) return [def.min, Math.ceil(hi) + 1]
    return [Math.min(def.min, Math.floor(lo)), Math.max(def.max, Math.ceil(hi))]
}

/** Delta per sample, reset at each sector start when Sector Delta is on. */
function deltaPoints(delta: ChartProps['delta'], sectorEnds: number[], sectorDelta: boolean): [number, number][] {
    if (!delta) return []
    const pts = delta.samples.filter(s => s[2]).map(([d, v]) => [d, v] as [number, number])
    if (!sectorDelta) return pts
    const starts = [0, ...sectorEnds.slice(0, -1)]
    const base = starts.map(start => {
        const first = pts.find(([d]) => d >= start)
        return first ? first[1] : 0
    })
    return pts.map(([d, v]) => {
        const sector = starts.reduce((acc, start, i) => d >= start ? i : acc, 0)
        return [d, v - base[sector]]
    })
}

export default function Charts(props: ChartProps) {
    const { ref, width, height } = useSize<HTMLDivElement>()
    const baseRef = useRef<HTMLCanvasElement>(null)
    const overlayRef = useRef<HTMLCanvasElement>(null)
    const geometryRef = useRef<any>(null)
    const hoverRef = useRef<number | null>(null)
    const [tooltip, setTooltip] = useState<{ x: number; y: number; rows: { label: string; color: string; a: string; b: string | null }[]; title: string } | null>(null)
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
    }, [current?.lap, comparison?.lap]) // eslint-disable-line react-hooks/exhaustive-deps

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
                    let prevY = 0
                    for (let i = 0; i < t.d.length; i++) {
                        const x = X(t.d[i]), y = Y(norm(def.value(t, i)))
                        if (i === 0) ctx.moveTo(x, y)
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
            return def.format(def.value(lap.trace, i))
        }
        const rows = shown.filter(Boolean).flatMap(item => {
            if (item.metricId === 'delta') {
                const pt = g.dPts.find(([pd]: [number, number]) => pd >= d)
                const v = pt ? pt[1] : null
                return [{ label: 'Delta', color: v !== null && v < 0 ? item.negativeColor ?? '#37872D' : item.color, a: v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(3)} s`, b: null }]
            }
            const combined = COMBINED_BY_ID.get(item.metricId)
            return seriesMemberIds(item).map(id => {
                const corner = combined && TYRE_CORNERS.find(c => c.key === cornerKeyOf(item.metricId, id))
                return {
                    label: corner ? `${combined.shortLabel} ${corner.label}` : METRIC_BY_ID.get(id)!.label, color: seriesLineColor(item, id),
                    a: valueAt(current, id), b: comparison ? valueAt(comparison, id) : null,
                }
            })
        })
        setTooltip({ x, y, rows, title: `${Math.round(d).toLocaleString('en-US')} m` })
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
        {tooltip && tooltip.rows.length > 0 && <div
            className="pointer-events-none absolute z-20 min-w-[150px] rounded-md border border-[var(--border)] bg-[var(--bg-menu)] px-2.5 py-2 text-[10px] font-mono text-[var(--text-primary)] shadow-[0_6px_20px_rgba(0,0,0,0.4)]"
            style={{ left: tooltip.x > width - 220 ? undefined : tooltip.x + 14, right: tooltip.x > width - 220 ? width - tooltip.x + 14 : undefined, top: Math.min(tooltip.y + 10, height - 30 - tooltip.rows.length * 18) }}>
            <div className="mb-1 text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">{tooltip.title}</div>
            {tooltip.rows.map(row => <div key={row.label} className="flex items-center gap-2 py-[1px] tabular-nums">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: row.color }} />
                <span className="flex-1 text-[var(--text-secondary)]">{row.label}</span>
                <span className="font-semibold" style={{ color: row.color }}>{row.a}</span>
                {row.b !== null && <span className="text-[var(--text-secondary)]">{row.b}</span>}
            </div>)}
        </div>}
    </div>
}
