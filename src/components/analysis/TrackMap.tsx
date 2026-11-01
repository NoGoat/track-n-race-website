// The app's track map (electron-frontend components/TrackMap.tsx), as Analysis uses it: the bundled
// track_<id>.json drawn in sector colours with the 2026 SLM overlay, speed traps and the start/finish line,
// painted by a map layer, with braking/apex marks and two labelled lap markers. Drawing code ported as written.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TrackPaint } from './lib'

const SECTOR_COLORS = ['#E8002D', '#0090D0', '#FFD700']
const SLM_DRY_COLOR = '#46E396'
const TRAP_COLOR = '#8881DE'
const SF_COLOR = '#E8002D'
const OVERTAKE_COLOR = '#95E7F0'
const TRACK_PX = 5
const DRS_PX = 6
const DRS_OFFSET = 18
const TRAP_R = 9
const SF_HALF = 14
const JUNC_HALF = 10
const DOT_R = 7
const MAP_PAD = 24
const MAP_FIT_PAD = MAP_PAD + DRS_OFFSET + DRS_PX / 2
const LABEL_MIN_W = 38
const LABEL_H = 16
const LABEL_GAP = 5
const LABEL_R = 3
const ACCENT_W = 3
const LABEL_TEXT_PAD_X = 6
const LABEL_FONT = 'bold 9px "Cascadia Code", ui-monospace, monospace'
const MARK_HOVER_PX = 8

type Pt = [number, number]
export interface TrackMark { fromFraction: number; toFraction: number; color: string; opacity?: number; tooltip?: ReactNode }
export interface TrackMapMarker { x: number; z: number; label: string; color: string }

function rotatePoint(px: number, py: number, cos: number, sin: number, cx: number, cy: number): Pt {
    const dx = px - cx, dy = py - cy
    return [cos * dx - sin * dy + cx, sin * dx + cos * dy + cy]
}
const toCanvas = (p: Pt, scale: number, ox: number, oy: number): Pt => [p[0] * scale + ox, p[1] * scale + oy]
function perp(pts: Pt[], i: number): Pt {
    const lo = Math.max(0, i - 1), hi = Math.min(pts.length - 1, i + 1)
    const dx = pts[hi][0] - pts[lo][0], dy = pts[hi][1] - pts[lo][1]
    const len = Math.hypot(dx, dy) || 1
    return [-dy / len, dx / len]
}
const rawToViewBox = (x: number, z: number, t: any): Pt => [(x - t.min_x) * t.scale + t.off_x, (z - t.min_z) * t.scale + t.off_z]

function buildCenterline(map: any): Pt[] {
    const ordered = [...map.sectors].sort((a: any, b: any) => a.index - b.index)
    const pts: Pt[] = []
    for (const s of ordered) for (const p of s.points as Pt[]) {
        const last = pts[pts.length - 1]
        if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push([p[0], p[1]])
    }
    if (pts.length > 1) {
        const first = pts[0], last = pts[pts.length - 1]
        if (first[0] === last[0] && first[1] === last[1]) pts.pop()
    }
    return pts
}
function nearestIdx(pts: Pt[], p: Pt): number {
    let best = 0, bestD = Infinity
    for (let i = 0; i < pts.length; i++) {
        const d = (pts[i][0] - p[0]) ** 2 + (pts[i][1] - p[1]) ** 2
        if (d < bestD) { bestD = d; best = i }
    }
    return best
}
function sliceZone(centerline: Pt[], start: Pt, end: Pt): Pt[] {
    const N = centerline.length
    const si = nearestIdx(centerline, start), ei = nearestIdx(centerline, end)
    const out: Pt[] = []
    let i = si
    for (let n = 0; n < N; n++) { out.push(centerline[i]); if (i === ei) break; i = (i + 1) % N }
    return out
}
function pointInPolygon([x, y]: Pt, polygon: Pt[]): boolean {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i], [xj, yj] = polygon[j]
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
}
function findOutwardSign(zone: Pt[], centerline: Pt[]): 1 | -1 {
    const step = Math.max(1, Math.floor(zone.length / 128))
    let positive = 0, negative = 0
    for (let i = 0; i < zone.length; i += step) {
        const [nx, ny] = perp(zone, i), [x, y] = zone[i]
        const pIn = pointInPolygon([x + nx * 2, y + ny * 2], centerline)
        const nIn = pointInPolygon([x - nx * 2, y - ny * 2], centerline)
        if (pIn === nIn) continue
        if (pIn) negative++; else positive++
    }
    if (positive !== negative) return positive > negative ? 1 : -1
    let area = 0
    for (let i = 0, j = centerline.length - 1; i < centerline.length; j = i++) area += centerline[j][0] * centerline[i][1] - centerline[i][0] * centerline[j][1]
    return area >= 0 ? -1 : 1
}
function turnAngleDeg(a: Pt, b: Pt, c: Pt): number {
    const d1x = b[0] - a[0], d1y = b[1] - a[1], d2x = c[0] - b[0], d2y = c[1] - b[1]
    const dot = (d1x * d2x + d1y * d2y) / ((Math.hypot(d1x, d1y) || 1) * (Math.hypot(d2x, d2y) || 1))
    return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI
}
function smoothSeam(pts: Pt[]): Pt[] {
    const n = pts.length
    if (n < 5) return pts
    const weight = new Array<number>(n).fill(0)
    let any = false
    for (let i = 1; i < n - 1; i++) if (turnAngleDeg(pts[i - 1], pts[i], pts[i + 1]) > 6) {
        for (let j = i - 6; j <= i + 6; j++) if (j > 0 && j < n - 1) {
            const taper = 0.5 * (1 + Math.cos((Math.PI * Math.abs(j - i)) / 7))
            if (taper > weight[j]) { weight[j] = taper; any = true }
        }
    }
    if (!any) return pts
    let out: Pt[] = pts.map(p => [p[0], p[1]])
    for (let pass = 0; pass < 20; pass++) {
        const next: Pt[] = out.map(p => [p[0], p[1]])
        for (let i = 1; i < n - 1; i++) if (weight[i] > 0) {
            next[i][0] = out[i][0] + weight[i] * ((out[i - 1][0] + out[i + 1][0]) / 2 - out[i][0])
            next[i][1] = out[i][1] + weight[i] * ((out[i - 1][1] + out[i + 1][1]) / 2 - out[i][1])
        }
        out = next
    }
    return out
}

function prepareMap(map: any) {
    const rad = ((map.rotation_deg ?? 0) * Math.PI) / 180
    const cos = Math.cos(rad), sin = Math.sin(rad)
    const cx = map.view_box.width / 2, cy = map.view_box.height / 2
    const rot = (p: Pt): Pt => rotatePoint(p[0], p[1], cos, sin, cx, cy)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    const sectors = map.sectors.map((sector: any) => {
        const pts = (sector.points as Pt[]).map(rot)
        for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
        return { index: sector.index, points: pts }
    })
    const centerline = buildCenterline(map)
    const rotated = centerline.map(rot)
    const reconstruct = (zones: any[]) => zones.map(z => {
        const track_points = smoothSeam(sliceZone(centerline, z.start, z.end)).map(rot)
        return { track_points, outwardSign: findOutwardSign(track_points, rotated) }
    })
    const slmDry = reconstruct(map.slm_dry ?? [])
    const speedTraps = (map.speed_traps as Pt[]).map(rot)
    const startFinish: Pt | null = map.start_finish ? rot(map.start_finish) : null
    const overtakeDetection: Pt | null = map.overtake_detection_point ? rot(map.overtake_detection_point) : null
    let overtakeActivation: { pt: Pt; nx: number; ny: number; color: string } | null = null
    if (map.overtake_activation_point && rotated.length > 1) {
        const pt = rot(map.overtake_activation_point)
        const [nx, ny] = perp(rotated, nearestIdx(rotated, pt))
        overtakeActivation = { pt, nx, ny, color: OVERTAKE_COLOR }
    }
    const s1pts: Pt[] = sectors[0]?.points ?? []
    let sfIdx = 0
    if (startFinish && s1pts.length) {
        let bestD = Infinity
        s1pts.forEach((p, i) => { const d = Math.hypot(p[0] - startFinish[0], p[1] - startFinish[1]); if (d < bestD) { bestD = d; sfIdx = i } })
    }
    const junctions = sectors.slice(0, -1).filter((s: any) => s.points.length >= 2).map((s: any, si: number) => {
        const last = s.points.length - 1
        const [nx, ny] = perp(s.points, last)
        return { pt: s.points[last] as Pt, nx, ny, color: SECTOR_COLORS[si + 1] }
    })
    const lapStart = startFinish && rotated.length ? nearestIdx(rotated, startFinish) : 0
    const lapLine = [...rotated.slice(lapStart), ...rotated.slice(0, lapStart)]
    const lapFraction = new Float64Array(lapLine.length)
    let arc = 0
    for (let i = 1; i < lapLine.length; i++) { arc += Math.hypot(lapLine[i][0] - lapLine[i - 1][0], lapLine[i][1] - lapLine[i - 1][1]); lapFraction[i] = arc }
    const total = arc + Math.hypot(lapLine[0][0] - lapLine[lapLine.length - 1][0], lapLine[0][1] - lapLine[lapLine.length - 1][1])
    if (total > 0) for (let i = 0; i < lapFraction.length; i++) lapFraction[i] /= total
    return {
        sectors, slmDry, speedTraps, startFinish, overtakeDetection, overtakeActivation, s1pts, sfIdx, junctions,
        lapLine, lapFraction, bounds: { minX, minY, w: maxX - minX, h: maxY - minY }, cos, sin, cx, cy,
    }
}
type Prepared = ReturnType<typeof prepareMap>

function buildLayout(prep: Prepared, cw: number, ch: number) {
    const { minX, minY, w, h } = prep.bounds
    const scale = Math.min((cw - 2 * MAP_FIT_PAD) / w, (ch - 2 * MAP_FIT_PAD) / h)
    return { scale, ox: (cw - w * scale) / 2 - minX * scale, oy: (ch - h * scale) / 2 - minY * scale }
}

function drawPolyline(ctx: CanvasRenderingContext2D, pts: Pt[], scale: number, ox: number, oy: number, color: string, lineWidth: number) {
    if (pts.length < 2) return
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    pts.forEach((p, i) => { const [x, y] = toCanvas(p, scale, ox, oy); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y) })
    ctx.stroke()
}
function drawOffsetLine(ctx: CanvasRenderingContext2D, pts: Pt[], sign: 1 | -1, scale: number, ox: number, oy: number, color: string) {
    if (pts.length < 2) return
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = DRS_PX
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
    ctx.setLineDash([3, 3])
    const offset = Math.max(DRS_OFFSET, TRACK_PX / 2 + 8)
    pts.forEach((p, i) => {
        const [nx, ny] = perp(pts, i), [x, y] = toCanvas(p, scale, ox, oy)
        if (i) ctx.lineTo(x + nx * offset * sign, y + ny * offset * sign); else ctx.moveTo(x + nx * offset * sign, y + ny * offset * sign)
    })
    ctx.stroke()
    ctx.setLineDash([])
}
function drawDot(ctx: CanvasRenderingContext2D, pt: Pt, scale: number, ox: number, oy: number, color: string) {
    const [x, y] = toCanvas(pt, scale, ox, oy)
    ctx.beginPath()
    ctx.arc(x, y, Math.max(TRAP_R, TRACK_PX / 2 + 4), 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
}
function drawTick(ctx: CanvasRenderingContext2D, pt: Pt, nx: number, ny: number, half: number, width: number, color: string, scale: number, ox: number, oy: number) {
    const [x, y] = toCanvas(pt, scale, ox, oy)
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.moveTo(x - nx * half, y - ny * half)
    ctx.lineTo(x + nx * half, y + ny * half)
    ctx.stroke()
}
function lapPointAt(prep: Prepared, fraction: number): Pt {
    const pts = prep.lapLine, fr = prep.lapFraction, n = pts.length
    const f = ((fraction % 1) + 1) % 1
    let lo = 0, hi = n - 1
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (fr[mid] <= f) lo = mid; else hi = mid - 1 }
    const next = (lo + 1) % n
    const span = (next === 0 ? 1 : fr[next]) - fr[lo]
    const t = span > 0 ? (f - fr[lo]) / span : 0
    return [pts[lo][0] + (pts[next][0] - pts[lo][0]) * t, pts[lo][1] + (pts[next][1] - pts[lo][1]) * t]
}
function drawPaintedTrack(ctx: CanvasRenderingContext2D, prep: Prepared, paint: TrackPaint, scale: number, ox: number, oy: number, lineWidth: number) {
    const pts = prep.lapLine, fr = prep.lapFraction, n = pts.length
    ctx.lineWidth = lineWidth
    ctx.lineCap = paint.translucent ? 'butt' : 'round'
    ctx.lineJoin = 'round'
    let run: string | null = null
    const flush = () => { if (run !== null) { ctx.strokeStyle = run; ctx.stroke() } }
    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n
        const color = paint.colorAt((fr[i] + (next === 0 ? 1 : fr[next])) / 2)
        if (color !== run) {
            flush()
            run = color
            if (color !== null) { ctx.beginPath(); const [x, y] = toCanvas(pts[i], scale, ox, oy); ctx.moveTo(x, y) }
        }
        if (color !== null) { const [x, y] = toCanvas(pts[next], scale, ox, oy); ctx.lineTo(x, y) }
    }
    flush()
}
function drawTrackMarks(ctx: CanvasRenderingContext2D, prep: Prepared, marks: readonly TrackMark[], scale: number, ox: number, oy: number): Pt[][] {
    const paths: Pt[][] = []
    const width = TRACK_PX + 3
    const fr = prep.lapFraction
    for (const mark of marks) {
        const from = mark.fromFraction
        const to = mark.toFraction >= from ? mark.toFraction : mark.toFraction + 1
        const steps = [from]
        for (let lap = 0; lap <= 1; lap++) for (let k = 0; k < fr.length; k++) { const f = fr[k] + lap; if (f > from && f < to) steps.push(f) }
        steps.push(to)
        const path = steps.map(f => toCanvas(lapPointAt(prep, f), scale, ox, oy))
        const trace = () => { ctx.beginPath(); path.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))) }
        ctx.lineCap = 'butt'
        ctx.lineJoin = 'round'
        trace()
        ctx.strokeStyle = '#0c0d12'
        ctx.lineWidth = width + 3
        ctx.stroke()
        trace()
        ctx.save()
        ctx.globalAlpha = mark.opacity ?? 1
        ctx.strokeStyle = mark.color
        ctx.lineWidth = width
        ctx.stroke()
        ctx.restore()
        paths.push(path)
    }
    return paths
}

function renderBackground(ctx: CanvasRenderingContext2D, cw: number, ch: number, prep: Prepared, layout: ReturnType<typeof buildLayout>,
    sectorColors: boolean, paint: TrackPaint | null, marks: readonly TrackMark[] | null): Pt[][] {
    ctx.clearRect(0, 0, cw, ch)
    const { scale, ox, oy } = layout
    const trackColor = '#ffffff'
    if (paint) drawPaintedTrack(ctx, prep, paint, scale, ox, oy, TRACK_PX)
    else for (const sector of prep.sectors) drawPolyline(ctx, sector.points, scale, ox, oy, sectorColors ? (SECTOR_COLORS[sector.index - 1] ?? trackColor) : trackColor, TRACK_PX)
    const sectorTrack = sectorColors && !paint
    prep.junctions.forEach((j, idx) => drawTick(ctx, j.pt, j.nx, j.ny, Math.max(JUNC_HALF, TRACK_PX / 2 + 4), 3, sectorTrack ? trackColor : (SECTOR_COLORS[idx + 1] ?? trackColor), scale, ox, oy))
    // F1 26 recordings: the SLM overlay (full grip set), with the overtake markers
    for (const zone of prep.slmDry) drawOffsetLine(ctx, zone.track_points, zone.outwardSign, scale, ox, oy, SLM_DRY_COLOR)
    if (prep.overtakeDetection && !paint) drawDot(ctx, prep.overtakeDetection, scale, ox, oy, OVERTAKE_COLOR)
    if (prep.overtakeActivation && !paint) {
        const a = prep.overtakeActivation
        drawTick(ctx, a.pt, a.nx, a.ny, Math.max(JUNC_HALF, TRACK_PX / 2 + 4), 3, OVERTAKE_COLOR, scale, ox, oy)
    }
    if (!paint) for (const trap of prep.speedTraps) drawDot(ctx, trap, scale, ox, oy, TRAP_COLOR)
    if (prep.startFinish) {
        const [nx, ny] = perp(prep.s1pts, prep.sfIdx)
        drawTick(ctx, prep.startFinish, nx, ny, Math.max(SF_HALF, TRACK_PX / 2 + 4), 2.5, sectorTrack ? trackColor : SF_COLOR, scale, ox, oy)
    }
    return marks?.length ? drawTrackMarks(ctx, prep, marks, scale, ox, oy) : []
}

const labelCache = new Map<string, { canvas: HTMLCanvasElement; labelWidth: number }>()
function drawLabel(ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string, color: string) {
    const dpr = Math.max(1, ctx.getTransform().a)
    const key = `${text}|${color}|${dpr}`
    let sprite = labelCache.get(key)
    if (!sprite) {
        const canvas = document.createElement('canvas')
        const s = canvas.getContext('2d')!
        s.font = LABEL_FONT
        const labelWidth = Math.max(LABEL_MIN_W, Math.ceil(s.measureText(text).width + ACCENT_W + LABEL_TEXT_PAD_X * 2))
        canvas.width = Math.ceil((labelWidth + 16) * dpr)
        canvas.height = Math.ceil((LABEL_H + 16) * dpr)
        s.setTransform(dpr, 0, 0, dpr, 0, 0)
        s.shadowColor = 'rgba(0,0,0,0.55)'
        s.shadowBlur = 6
        s.shadowOffsetY = 2
        s.beginPath()
        s.roundRect(8, 8, labelWidth, LABEL_H, LABEL_R)
        s.fillStyle = 'rgba(10,15,30,0.92)'
        s.fill()
        s.shadowColor = 'transparent'
        s.shadowBlur = 0
        s.shadowOffsetY = 0
        s.beginPath()
        s.roundRect(8, 8, ACCENT_W, LABEL_H, [LABEL_R, 0, 0, LABEL_R])
        s.fillStyle = color
        s.fill()
        s.font = LABEL_FONT
        s.textAlign = 'center'
        s.textBaseline = 'middle'
        s.fillStyle = '#ffffff'
        s.fillText(text, 8 + labelWidth / 2 + ACCENT_W / 2, 8 + LABEL_H / 2)
        sprite = { canvas, labelWidth }
        labelCache.set(key, sprite)
    }
    const bx = cx - sprite.labelWidth / 2, by = cy - DOT_R - LABEL_GAP - LABEL_H
    ctx.drawImage(sprite.canvas, Math.round((bx - 8) * dpr) / dpr, Math.round((by - 8) * dpr) / dpr, sprite.canvas.width / dpr, sprite.canvas.height / dpr)
}

function useSize<T extends HTMLElement>() {
    const ref = useRef<T>(null)
    const [size, setSize] = useState({ width: 0, height: 0 })
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const observer = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }))
        observer.observe(el)
        return () => observer.disconnect()
    }, [])
    return { ref, ...size }
}
export { useSize }

export default function TrackMap({ map, sectorColors = true, trackPaint = null, trackMarks = null, markerSource, onMarkHover }: {
    map: any
    sectorColors?: boolean
    trackPaint?: TrackPaint | null
    trackMarks?: readonly TrackMark[] | null
    markerSource?: () => readonly TrackMapMarker[]
    onMarkHover?: (index: number | null) => void
}) {
    const { ref: wrapRef, width, height } = useSize<HTMLDivElement>()
    const bgRef = useRef<HTMLCanvasElement>(null)
    const fgRef = useRef<HTMLCanvasElement>(null)
    const pathsRef = useRef<Pt[][]>([])
    const [hovered, setHovered] = useState<{ index: number; x: number; y: number } | null>(null)
    const prep = useMemo(() => map ? prepareMap(map) : null, [map])
    const layout = useMemo(() => prep && width > 0 && height > 0 ? buildLayout(prep, width, height) : null, [prep, width, height])
    const sourceRef = useRef(markerSource)
    sourceRef.current = markerSource

    useEffect(() => {
        const canvas = bgRef.current
        if (!canvas || !prep || !layout) return
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
        const ctx = canvas.getContext('2d')!
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        pathsRef.current = renderBackground(ctx, width, height, prep, layout, sectorColors, trackPaint, trackMarks)
    }, [height, layout, prep, sectorColors, trackMarks, trackPaint, width])

    // New marks invalidate what was hovered
    useEffect(() => { setHovered(null); onMarkHover?.(null) }, [trackMarks]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const canvas = fgRef.current
        if (!canvas || !prep || !layout || !map) return
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
        const ctx = canvas.getContext('2d')!
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        let frame = 0
        const loop = () => {
            ctx.clearRect(0, 0, width, height)
            const markers = sourceRef.current?.() ?? []
            const placed = markers.filter(m => Number.isFinite(m.x) && Number.isFinite(m.z)).map(m => {
                const [vx, vy] = rawToViewBox(m.x, m.z, map.transform)
                const r = rotatePoint(vx, vy, prep.cos, prep.sin, prep.cx, prep.cy)
                return { ...m, p: toCanvas(r, layout.scale, layout.ox, layout.oy) }
            })
            for (const m of placed) { ctx.beginPath(); ctx.arc(m.p[0], m.p[1], DOT_R, 0, Math.PI * 2); ctx.fillStyle = m.color; ctx.fill() }
            for (const m of placed) drawLabel(ctx, m.p[0], m.p[1], m.label, m.color)
            frame = requestAnimationFrame(loop)
        }
        frame = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(frame)
    }, [height, layout, map, prep, width])

    const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!trackMarks?.length) return
        const rect = event.currentTarget.getBoundingClientRect()
        const scale = rect.width / (event.currentTarget.offsetWidth || rect.width)
        const x = (event.clientX - rect.left) / scale, y = (event.clientY - rect.top) / scale
        let best = -1, bestD = MARK_HOVER_PX + TRACK_PX
        pathsRef.current.forEach((path, index) => {
            for (let k = 1; k < path.length; k++) {
                const [ax, ay] = path[k - 1], [bx, by] = path[k]
                const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy || 1
                const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len))
                const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t))
                // Later marks (apexes) draw over earlier ones (zones), so they win a tie
                if (d <= bestD) { bestD = d; best = index }
            }
        })
        if (best < 0) { if (hovered) { setHovered(null); onMarkHover?.(null) } return }
        if (hovered?.index !== best) onMarkHover?.(best)
        setHovered({ index: best, x, y })
    }

    const tooltip = hovered && trackMarks?.[hovered.index]?.tooltip
    return <div ref={wrapRef} className="relative w-full h-full" onMouseMove={handleMove}
        onMouseLeave={() => { setHovered(null); onMarkHover?.(null) }} style={{ cursor: hovered ? 'pointer' : undefined }}>
        {tooltip && <div data-tour="map-tooltip"
            className="pointer-events-none absolute z-20 w-max rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-2.5 text-[10px] font-mono text-[var(--text-primary)] shadow-[0_6px_20px_rgba(0,0,0,0.4)]"
            style={{
                left: hovered!.x > width - 310 ? undefined : hovered!.x + 12,
                right: hovered!.x > width - 310 ? width - hovered!.x + 12 : undefined,
                top: Math.min(hovered!.y + 12, Math.max(0, height - 400)),
            }}>{tooltip}</div>}
        <canvas ref={bgRef} className="absolute inset-0" />
        <canvas ref={fgRef} className="absolute inset-0 pointer-events-none" />
        {!map && <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] uppercase tracking-widest text-[var(--text-secondary)]">No map data</span>
        </div>}
    </div>
}

/** A mark's middle, in the map's CSS pixels: where the tour points at a braking zone or an apex. */
export function markPoint(map: any, mark: TrackMark, width: number, height: number): Pt | null {
    if (!map || !width || !height) return null
    const prep = prepareMap(map)
    const layout = buildLayout(prep, width, height)
    const to = mark.toFraction >= mark.fromFraction ? mark.toFraction : mark.toFraction + 1
    return toCanvas(lapPointAt(prep, (mark.fromFraction + to) / 2), layout.scale, layout.ox, layout.oy)
}
