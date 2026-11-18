// The app's track map (electron-frontend components/TrackMap.tsx), as Analysis uses it: the bundled
// track_<id>.json drawn in sector colours with the 2026 SLM overlay, speed traps and the start/finish line,
// painted by a map layer or stripped to the laps' racing lines, with braking/apex marks, two labelled lap markers,
// and scroll to zoom / drag to pan. Drawing code ported as written.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { MAP_ZOOM_MAX, type TrackPaint } from './lib'
import { canvasDpr, useCanvasBoost } from './camera'

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
const RACING_LINE_PX = 1.5
const RACING_MARK_PX = 9
const RACING_MARK_ALPHA = 0.4
// A caret mark, in pixels at 1x zoom: the gap from the track's edge to its tip, its length, and half its base
const CARET_GAP_PX = 1.6
const CARET_LENGTH_PX = 7
const CARET_HALF_BASE_PX = 3.8
// The hover card sits this far from the pointer
const MARK_CARD_GAP_PX = 12
// A press that moves further than this before release is a drag, not a click
const MARK_CLICK_SLOP_PX = 4

type Pt = [number, number]
export interface TrackMark {
    fromFraction: number; toFraction: number; color: string; opacity?: number; tooltip?: ReactNode
    /** Draws a caret on the inside of the bend at the stretch's middle instead of painting the stretch */
    caret?: boolean
    /** On the Racing Line layer: the stretch along a lap's own path, in world coordinates */
    points?: readonly { x: number; z: number }[]
    /** Clicking the stretch (not dragging the map) calls this */
    onClick?: () => void
}
export interface TrackMapMarker { x: number; z: number; label: string; color: string }
/** One lap's recorded path, in world coordinates */
export interface RacingLine { points: readonly { x: number; z: number }[]; color: string }
/** How far the map is zoomed (1 is the whole circuit) and the map point at its centre. Mutable: the maps read it
 *  every frame, and maps shown side by side share one. */
export interface TrackMapView { zoom: number; cx: number; cy: number }

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
        lapLine, lapFraction, bounds: { minX, minY, w: maxX - minX, h: maxY - minY }, cos, sin, cx, cy, transform: map.transform,
    }
}
type Prepared = ReturnType<typeof prepareMap>

function buildLayout(prep: Prepared, cw: number, ch: number) {
    const { minX, minY, w, h } = prep.bounds
    const scale = Math.min((cw - 2 * MAP_FIT_PAD) / w, (ch - 2 * MAP_FIT_PAD) / h)
    return { scale, ox: (cw - w * scale) / 2 - minX * scale, oy: (ch - h * scale) / 2 - minY * scale }
}
type Layout = ReturnType<typeof buildLayout>

/** Keeps a zoomed view inside what the whole-circuit layout shows */
function clampView(view: TrackMapView, base: Layout, cw: number, ch: number) {
    view.zoom = Math.min(MAP_ZOOM_MAX, Math.max(1, view.zoom))
    const room = (1 - 1 / view.zoom) / (2 * base.scale)
    const midX = (cw / 2 - base.ox) / base.scale
    const midY = (ch / 2 - base.oy) / base.scale
    view.cx = Math.min(midX + cw * room, Math.max(midX - cw * room, view.cx))
    view.cy = Math.min(midY + ch * room, Math.max(midY - ch * room, view.cy))
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
function drawOffsetLine(ctx: CanvasRenderingContext2D, pts: Pt[], sign: 1 | -1, scale: number, ox: number, oy: number, color: string, z = 1, tz = 1) {
    if (pts.length < 2) return
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = DRS_PX * z
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
    ctx.setLineDash([3 * z, 3 * z])
    const offset = Math.max(DRS_OFFSET * z, (TRACK_PX * tz) / 2 + 8 * z)
    pts.forEach((p, i) => {
        const [nx, ny] = perp(pts, i), [x, y] = toCanvas(p, scale, ox, oy)
        if (i) ctx.lineTo(x + nx * offset * sign, y + ny * offset * sign); else ctx.moveTo(x + nx * offset * sign, y + ny * offset * sign)
    })
    ctx.stroke()
    ctx.setLineDash([])
}
function drawDot(ctx: CanvasRenderingContext2D, pt: Pt, scale: number, ox: number, oy: number, color: string, z = 1, tz = 1) {
    const [x, y] = toCanvas(pt, scale, ox, oy)
    ctx.beginPath()
    ctx.arc(x, y, Math.max(TRAP_R * z, (TRACK_PX * tz) / 2 + 4 * z), 0, Math.PI * 2)
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
/** A caret on the inside of the bend at a stretch's middle, pointing at the track. The inside comes from the drawn
 *  line, over twice the stretch's length either side. Returns the caret's centre, for hover. */
function drawCaret(ctx: CanvasRenderingContext2D, prep: Prepared, mark: TrackMark, to: number, scale: number, ox: number, oy: number, tz: number): Pt {
    const from = mark.fromFraction
    const middle = (from + to) / 2
    const reach = (to - from) * 2
    const at = (fraction: number) => toCanvas(lapPointAt(prep, fraction), scale, ox, oy)
    const [x, y] = at(middle)
    const [beforeX, beforeY] = at(middle - reach)
    const [afterX, afterY] = at(middle + reach)
    const [startX, startY] = at(from)
    const [endX, endY] = at(to)
    const length = Math.hypot(endX - startX, endY - startY) || 1
    const tangentX = (endX - startX) / length
    const tangentY = (endY - startY) / length
    // Canvas y runs down, so a positive cross product is a clockwise bend, whose inside is on the right of the
    // direction of travel
    const bend = (x - beforeX) * (afterY - y) - (y - beforeY) * (afterX - x)
    const inward = bend >= 0 ? 1 : -1
    const normalX = -tangentY * inward
    const normalY = tangentX * inward
    const trackEdge = TRACK_PX * tz / 2
    const tip = trackEdge + CARET_GAP_PX * tz
    const base = tip + CARET_LENGTH_PX * tz
    const halfBase = CARET_HALF_BASE_PX * tz
    const baseX = x + normalX * base
    const baseY = y + normalY * base
    ctx.save()
    ctx.globalAlpha = mark.opacity ?? 1
    ctx.fillStyle = mark.color
    ctx.beginPath()
    ctx.moveTo(x + normalX * tip, y + normalY * tip)
    ctx.lineTo(baseX + tangentX * halfBase, baseY + tangentY * halfBase)
    ctx.lineTo(baseX - tangentX * halfBase, baseY - tangentY * halfBase)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    const centre = (tip + base) / 2
    return [x + normalX * centre, y + normalY * centre]
}

function worldToCanvas(prep: Prepared, wx: number, wz: number, scale: number, ox: number, oy: number): Pt {
    const [vx, vy] = rawToViewBox(wx, wz, prep.transform)
    return toCanvas(rotatePoint(vx, vy, prep.cos, prep.sin, prep.cx, prep.cy), scale, ox, oy)
}

/** Braking zones as translucent bands along a lap's path, for under the lines so both stay readable. Returns the
 *  canvas points along each mark, for hover. */
function drawRacingLineMarks(ctx: CanvasRenderingContext2D, prep: Prepared, marks: readonly TrackMark[], scale: number, ox: number, oy: number): Pt[][] {
    ctx.lineWidth = RACING_MARK_PX
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'round'
    return marks.map(mark => {
        const path = (mark.points ?? []).map(point => worldToCanvas(prep, point.x, point.z, scale, ox, oy))
        if (path.length < 2) return path
        ctx.beginPath()
        path.forEach(([x, y], index) => (index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
        ctx.save()
        ctx.globalAlpha = (mark.opacity ?? 1) * RACING_MARK_ALPHA
        ctx.strokeStyle = mark.color
        ctx.stroke()
        ctx.restore()
        return path
    })
}

/** Each lap's path through every recorded position */
function drawRacingLines(ctx: CanvasRenderingContext2D, prep: Prepared, lines: readonly RacingLine[], scale: number, ox: number, oy: number) {
    ctx.lineWidth = RACING_LINE_PX
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const line of lines) {
        ctx.beginPath()
        let started = false
        for (const point of line.points) {
            if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) continue
            const [x, y] = worldToCanvas(prep, point.x, point.z, scale, ox, oy)
            if (started) ctx.lineTo(x, y)
            else ctx.moveTo(x, y)
            started = true
        }
        ctx.strokeStyle = line.color
        ctx.stroke()
    }
}

function drawTrackMarks(ctx: CanvasRenderingContext2D, prep: Prepared, marks: readonly TrackMark[], scale: number, ox: number, oy: number, tz = 1): Pt[][] {
    const paths: Pt[][] = []
    const width = TRACK_PX * tz + 3
    const fr = prep.lapFraction
    for (const mark of marks) {
        const from = mark.fromFraction
        const to = mark.toFraction >= from ? mark.toFraction : mark.toFraction + 1
        const steps = [from]
        for (let lap = 0; lap <= 1; lap++) for (let k = 0; k < fr.length; k++) { const f = fr[k] + lap; if (f > from && f < to) steps.push(f) }
        steps.push(to)
        const path = steps.map(f => toCanvas(lapPointAt(prep, f), scale, ox, oy))
        if (mark.caret) {
            path.push(drawCaret(ctx, prep, mark, to, scale, ox, oy, tz))
            paths.push(path)
            continue
        }
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

function renderBackground(ctx: CanvasRenderingContext2D, cw: number, ch: number, prep: Prepared, layout: Layout, effectiveZoom: number,
    sectorColors: boolean, paint: TrackPaint | null, marks: readonly TrackMark[] | null, racingLines: readonly RacingLine[] | null): Pt[][] {
    ctx.clearRect(0, 0, cw, ch)
    const { scale, ox, oy } = layout
    const z = Math.sqrt(effectiveZoom)
    // Stronger scaling factor specifically for track width so cars don't float off-track
    const tz = Math.pow(effectiveZoom, 0.8)
    const trackColor = '#ffffff'
    const half = (base: number) => Math.max(base * z, (TRACK_PX * tz) / 2 + 4 * z)
    const startFinish = (color: string) => {
        if (!prep.startFinish) return
        const [nx, ny] = perp(prep.s1pts, prep.sfIdx)
        drawTick(ctx, prep.startFinish, nx, ny, half(SF_HALF), 2.5 * z, color, scale, ox, oy)
    }
    // Racing Line: the sector boundaries are all that is left of the map
    if (racingLines) {
        const markPaths = marks ? drawRacingLineMarks(ctx, prep, marks, scale, ox, oy) : []
        drawRacingLines(ctx, prep, racingLines, scale, ox, oy)
        prep.junctions.forEach((j: any, idx: number) => drawTick(ctx, j.pt, j.nx, j.ny, half(JUNC_HALF), 3 * z, SECTOR_COLORS[idx + 1] ?? trackColor, scale, ox, oy))
        startFinish(SF_COLOR)
        return markPaths
    }
    if (paint) drawPaintedTrack(ctx, prep, paint, scale, ox, oy, TRACK_PX * tz)
    else for (const sector of prep.sectors) drawPolyline(ctx, sector.points, scale, ox, oy, sectorColors ? (SECTOR_COLORS[sector.index - 1] ?? trackColor) : trackColor, TRACK_PX * tz)
    const sectorTrack = sectorColors && !paint
    prep.junctions.forEach((j: any, idx: number) => drawTick(ctx, j.pt, j.nx, j.ny, half(JUNC_HALF), 3 * z, sectorTrack ? trackColor : (SECTOR_COLORS[idx + 1] ?? trackColor), scale, ox, oy))
    // F1 26 recordings: the SLM overlay (full grip set), with the overtake markers
    for (const zone of prep.slmDry) drawOffsetLine(ctx, zone.track_points, zone.outwardSign, scale, ox, oy, SLM_DRY_COLOR, z, tz)
    if (prep.overtakeDetection && !paint) drawDot(ctx, prep.overtakeDetection, scale, ox, oy, OVERTAKE_COLOR, z, tz)
    if (prep.overtakeActivation && !paint) {
        const a = prep.overtakeActivation
        drawTick(ctx, a.pt, a.nx, a.ny, half(JUNC_HALF), 3 * z, OVERTAKE_COLOR, scale, ox, oy)
    }
    if (!paint) for (const trap of prep.speedTraps) drawDot(ctx, trap, scale, ox, oy, TRAP_COLOR, z, tz)
    startFinish(sectorTrack ? trackColor : SF_COLOR)
    return marks?.length ? drawTrackMarks(ctx, prep, marks, scale, ox, oy, tz) : []
}

/** Where a mark's hover card goes inside the map: below and right of the pointer, flipped above or to the left where
 *  it would run past the map's edge, and held inside the map when it fits on neither side. Hidden until measured. */
function markCardPlacement(at: { x: number; y: number }, size: { width: number; height: number } | null, width: number, height: number): CSSProperties {
    if (!size) return { left: 0, top: 0, visibility: 'hidden' }
    const place = (pointer: number, extent: number, room: number) => {
        const after = pointer + MARK_CARD_GAP_PX
        if (after + extent <= room) return after
        const before = pointer - MARK_CARD_GAP_PX - extent
        if (before >= 0) return before
        return Math.max(0, room - extent)
    }
    return { left: place(at.x, size.width, width), top: place(at.y, size.height, height) }
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

export default function TrackMap({ map, sectorColors = true, trackPaint = null, trackMarks = null, racingLines = null, markerSource, onMarkHover, view, onViewChange, onViewFit }: {
    map: any
    sectorColors?: boolean
    trackPaint?: TrackPaint | null
    trackMarks?: readonly TrackMark[] | null
    /** Draws these paths on a map stripped to its sector boundaries */
    racingLines?: readonly RacingLine[] | null
    markerSource?: () => readonly TrackMapMarker[]
    onMarkHover?: (index: number | null) => void
    /** Turns on scroll to zoom and drag to pan, read and written here */
    view?: TrackMapView
    /** The user zoomed or started panning; receives the zoom */
    onViewChange?: (zoom: number) => void
    /** Double-click: back to the whole circuit */
    onViewFit?: () => void
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
    const boost = useCanvasBoost()
    // What the background draws, read each frame; a change marks it for redrawing
    const drawn = useRef({ sectorColors, trackPaint, trackMarks, racingLines })
    drawn.current = { sectorColors, trackPaint, trackMarks, racingLines }
    const dirtyRef = useRef(true)
    useEffect(() => { dirtyRef.current = true }, [sectorColors, trackPaint, trackMarks, racingLines])
    const viewRef = useRef(view)
    viewRef.current = view
    const dragRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)

    // New marks invalidate what was hovered
    useEffect(() => { setHovered(null); onMarkHover?.(null) }, [trackMarks]) // eslint-disable-line react-hooks/exhaustive-deps

    // One loop draws both canvases: the background when what it shows or the view changes (maps side by side share
    // one view, so a zoom on either redraws both), the lap markers every frame
    useEffect(() => {
        const bg = bgRef.current, fg = fgRef.current
        if (!bg || !fg || !prep || !layout || !map) return
        const dpr = canvasDpr(width, height)
        for (const canvas of [bg, fg]) {
            canvas.width = Math.round(width * dpr)
            canvas.height = Math.round(height * dpr)
            canvas.style.width = `${width}px`
            canvas.style.height = `${height}px`
        }
        const bctx = bg.getContext('2d')!, ctx = fg.getContext('2d')!
        bctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        let last: Layout | null = null
        let frame = 0
        const draw = () => {
            let current = layout
            const v = viewRef.current
            if (v) {
                clampView(v, layout, width, height)
                if (v.zoom > 1) {
                    const scale = layout.scale * v.zoom
                    current = { scale, ox: width / 2 - v.cx * scale, oy: height / 2 - v.cy * scale }
                }
                const cursor = v.zoom <= 1 ? '' : dragRef.current ? 'grabbing' : 'grab'
                if (bg.style.cursor !== cursor) bg.style.cursor = cursor
            } else if (bg.style.cursor) bg.style.cursor = ''
            if (dirtyRef.current || !last || last.scale !== current.scale || last.ox !== current.ox || last.oy !== current.oy) {
                const d = drawn.current
                pathsRef.current = renderBackground(bctx, width, height, prep, current, current.scale / layout.scale,
                    d.sectorColors, d.trackPaint, d.trackMarks, d.racingLines)
                last = current
                dirtyRef.current = false
            }
            ctx.clearRect(0, 0, width, height)
            const markers = sourceRef.current?.() ?? []
            const placed = markers.filter(m => Number.isFinite(m.x) && Number.isFinite(m.z)).map(m => {
                const [vx, vy] = rawToViewBox(m.x, m.z, map.transform)
                const r = rotatePoint(vx, vy, prep.cos, prep.sin, prep.cx, prep.cy)
                return { ...m, p: toCanvas(r, current.scale, current.ox, current.oy) }
            })
            for (const m of placed) { ctx.beginPath(); ctx.arc(m.p[0], m.p[1], DOT_R, 0, Math.PI * 2); ctx.fillStyle = m.color; ctx.fill() }
            for (const m of placed) drawLabel(ctx, m.p[0], m.p[1], m.label, m.color)
        }
        // Drawn straight away, so a resized canvas never shows a blank frame
        draw()
        const loop = () => { draw(); frame = requestAnimationFrame(loop) }
        frame = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(frame)
    }, [height, layout, map, prep, width, boost])

    // Scroll zooms about the pointer. A native listener, because React's wheel handlers are passive and could not
    // stop the page scrolling too.
    useEffect(() => {
        const canvas = bgRef.current
        if (!view || !canvas) return
        const handleWheel = (event: WheelEvent) => {
            if (!layout) return
            event.preventDefault()
            const rect = canvas.getBoundingClientRect()
            // Pointer in the map's own pixels (the window scales on narrow screens and under the camera)
            const k = rect.width / (canvas.offsetWidth || rect.width) || 1
            const px = (event.clientX - rect.left) / k - canvas.offsetWidth / 2
            const py = (event.clientY - rect.top) / k - canvas.offsetHeight / 2
            const before = layout.scale * view.zoom
            const zoom = Math.min(MAP_ZOOM_MAX, Math.max(1, view.zoom * Math.exp(-event.deltaY * 0.0015)))
            const after = layout.scale * zoom
            view.cx += px / before - px / after
            view.cy += py / before - py / after
            view.zoom = zoom
            onViewChange?.(zoom)
        }
        canvas.addEventListener('wheel', handleWheel, { passive: false })
        return () => canvas.removeEventListener('wheel', handleWheel)
    }, [layout, onViewChange, view])

    const handleViewPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!view || view.zoom <= 1 || event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { x: event.clientX, y: event.clientY, cx: view.cx, cy: view.cy }
        setHovered(null)
        onMarkHover?.(null)
        onViewChange?.(view.zoom)
    }
    const handleViewPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
        const drag = dragRef.current
        if (!view || !drag || !layout) return
        const rect = event.currentTarget.getBoundingClientRect()
        const k = rect.width / (event.currentTarget.offsetWidth || rect.width) || 1
        const scale = layout.scale * view.zoom
        view.cx = drag.cx - (event.clientX - drag.x) / k / scale
        view.cy = drag.cy - (event.clientY - drag.y) / k / scale
    }
    const handleViewPointerEnd = () => { dragRef.current = null }

    // The nearest mark that `wanted` accepts, by its closest point to the pointer (in the map's own pixels); index -1
    // when none is close enough. Later marks (apexes) draw over earlier ones (zones), so they win a tie.
    const markAt = useCallback((x: number, y: number, wanted: (mark: TrackMark) => boolean) => {
        const marks = drawn.current.trackMarks ?? []
        let best = -1, bestD = MARK_HOVER_PX + TRACK_PX, bestX = x, bestY = y
        pathsRef.current.forEach((path, index) => {
            if (!marks[index] || !wanted(marks[index])) return
            for (let k = 0; k < path.length; k++) {
                const [ax, ay] = path[k], [bx, by] = path[Math.min(k + 1, path.length - 1)]
                const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy
                const t = len > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0
                const px = ax + dx * t, py = ay + dy * t
                const d = Math.hypot(x - px, y - py)
                if (d <= bestD) { bestD = d; best = index; bestX = px; bestY = py }
            }
        })
        return { index: best, x: bestX, y: bestY }
    }, [])
    const local = (event: React.MouseEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const scale = rect.width / (event.currentTarget.offsetWidth || rect.width)
        return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale }
    }

    const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (dragRef.current || !trackMarks?.some(mark => mark.tooltip)) return
        const at = local(event)
        const { index: best, x: bestX, y: bestY } = markAt(at.x, at.y, mark => !!mark.tooltip)
        if (best < 0) { if (hovered) { setHovered(null); onMarkHover?.(null) } return }
        // As in the app (TrackMap.tsx handleMarkHover): the card pins to the point on the stretch nearest the pointer
        // when the stretch is first hovered, and stays put while the pointer moves along it
        if (hovered?.index === best) return
        onMarkHover?.(best)
        setHovered({ index: best, x: bestX, y: bestY })
    }
    // A click on a stretch, not the end of a drag across the map
    const pressRef = useRef<{ x: number; y: number } | null>(null)
    const handleMarkPress = (event: React.PointerEvent<HTMLDivElement>) => {
        pressRef.current = event.button === 0 ? { x: event.clientX, y: event.clientY } : null
    }
    const handleMarkClick = (event: React.MouseEvent<HTMLDivElement>) => {
        const press = pressRef.current
        pressRef.current = null
        if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > MARK_CLICK_SLOP_PX) return
        const at = local(event)
        const { index } = markAt(at.x, at.y, mark => !!mark.onClick)
        if (index >= 0) trackMarks?.[index]?.onClick?.()
    }
    // The hover card's measured size, so it is placed inside the map: beside the pointer, flipped above or to its
    // left where it would run off
    const cardRef = useRef<HTMLDivElement>(null)
    const [cardSize, setCardSize] = useState<{ width: number; height: number } | null>(null)
    useLayoutEffect(() => {
        const card = cardRef.current
        if (!card) { setCardSize(null); return }
        const measure = () => setCardSize(previous =>
            previous?.width === card.offsetWidth && previous.height === card.offsetHeight
                ? previous : { width: card.offsetWidth, height: card.offsetHeight })
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(card)
        return () => observer.disconnect()
    }, [hovered])

    const tooltip = hovered && trackMarks?.[hovered.index]?.tooltip
    return <div ref={wrapRef} className="relative w-full h-full" onMouseMove={handleMove}
        onMouseLeave={() => { setHovered(null); onMarkHover?.(null) }}
        onPointerDown={handleMarkPress} onClick={handleMarkClick}
        style={hovered && trackMarks?.[hovered.index]?.onClick ? { cursor: 'pointer' } : undefined}>
        {tooltip && <div ref={cardRef} key={hovered!.index} data-tour="map-tooltip"
            className="braking-card pointer-events-none absolute z-20 w-max rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-2.5 text-[10px] font-mono text-[var(--text-primary)] shadow-[0_6px_20px_rgba(0,0,0,0.4)]"
            style={markCardPlacement(hovered!, cardSize, width, height)}>{tooltip}</div>}
        <canvas ref={bgRef} className="absolute inset-0"
            onPointerDown={handleViewPointerDown} onPointerMove={handleViewPointerMove}
            onPointerUp={handleViewPointerEnd} onPointerCancel={handleViewPointerEnd} onDoubleClick={onViewFit} />
        <canvas ref={fgRef} className="absolute inset-0 pointer-events-none" />
        {!map && <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] uppercase tracking-widest text-[var(--text-secondary)]">No map data</span>
        </div>}
    </div>
}

/** A mark's middle, in the map's CSS pixels: where the tour points at a braking zone or an apex. */
/** How the track is fitted into a map of this size: canvas point = track point × scale + (ox, oy) */
export function trackFit(map: any, width: number, height: number): { scale: number; ox: number; oy: number } | null {
    if (!map || !width || !height) return null
    return buildLayout(prepareMap(map), width, height)
}

export function markPoint(map: any, mark: TrackMark, width: number, height: number): Pt | null {
    if (!map || !width || !height) return null
    const prep = prepareMap(map)
    const layout = buildLayout(prep, width, height)
    const to = mark.toFraction >= mark.fromFraction ? mark.toFraction : mark.toFraction + 1
    return toCanvas(lapPointAt(prep, (mark.fromFraction + to) / 2), layout.scale, layout.ox, layout.oy)
}
