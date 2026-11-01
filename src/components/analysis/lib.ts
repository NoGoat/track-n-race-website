// Shared pieces of the Analysis copy: the recordings' data, formatting, and the app's map paints
// (electron-frontend lib/analyzeMapPaint.ts) and metric definitions (lib/analyzeMetrics.ts), ported as written.

export interface Trace {
    t: number[]; d: number[]; x: number[]; z: number[]
    spd: number[]; thr: number[]; brk: number[]; str: number[]; gear: number[]; ers: number[]; rpm: number[]
}
export interface LapInfo {
    lap: number; time: number; s1: number; s2: number; s3: number
    compound: number; actual: number; start: number; tyreAge: number; fuel: number
    s1EndM: number; s2EndM: number; topSpeed: number; trace: Trace
}
export interface TourData {
    id: string; file: string; track: string; trackId: number; session: string; trackLengthM: number
    featured: number[]
    /** [lap, seconds, pit, visual compound, actual compound, start session time] */
    lapTimes: [number, number, number, number, number, number][]
    laps: Record<number, LapInfo>
    maps: Record<string, Record<string, any>>
    deltas: Record<string, { max: number; samples: [number, number, number][] }>
    driver: { name: string; number: number; index: number }
    fastestLap: number | null
    sessionTotal: number
    rotation: number; chunks: number; format: string; bytes: number
}

export const FILES = [
    { id: 'interlagos', track: 'São Paulo', trackId: 16, size: '4.8 MB', laps: 71,
        name: 'f1_26_16_s__o_paulo_grand_prix_race_2026-10-19T10-55-14-088Z-driver.tnrd' },
    { id: 'spa', track: 'Spa-Francorchamps', trackId: 10, size: '4.2 MB', laps: 44,
        name: 'f1_26_10_belgian_grand_prix_race_2026-10-17T16-37-19-562Z-driver.tnrd' },
] as const

const cache = new Map<string, Promise<any>>()
export function fetchJson(path: string): Promise<any> {
    if (!cache.has(path)) {
        cache.set(path, fetch(path).then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return response.json()
        }).catch(error => { cache.delete(path); throw error }))
    }
    return cache.get(path)!
}
export const loadRecording = (id: string): Promise<TourData> => fetchJson(`/assets/analysis-tour/${id}.json`)
export const loadTrackMap = (trackId: number): Promise<any> => fetchJson(`/assets/analysis-tour/track_${trackId}.json`)

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Formatting (app/bannerHelpers.ts, AnalyzeScreen.tsx) ────────────────────
export function fmtLap(seconds: number): string {
    const minutes = Math.floor(seconds / 60)
    return `${minutes}:${(seconds % 60).toFixed(3).padStart(6, '0')}`
}
export const fmtClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
export const fmtM = (m: number) => `${Math.round(m).toLocaleString('en-US')} m`
export const fmtKw = (kw: number) => `${Number.isInteger(kw) ? kw : kw.toFixed(1)} kW`
export const fmtDelta = (v: number | null) => v === null ? '—.---' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(3)}`

// The game's actual compounds (library spec tyre.actual) and their colours by visual compound (lib/tyreCompounds.ts)
const ACTUAL: Record<number, string> = { 16: 'C5', 17: 'C4', 18: 'C3', 19: 'C2', 20: 'C1', 21: 'C0', 22: 'C6', 7: 'Inter', 8: 'Wet' }
const VISUAL_COLOR: Record<number, string> = {
    16: 'var(--compound-soft)', 17: 'var(--compound-medium)', 18: 'var(--compound-hard)', 7: 'var(--compound-inter)', 8: 'var(--compound-wet)',
}
export const compoundName = (actual: number) => ACTUAL[actual] ?? null
export const compoundColor = (visual: number) => VISUAL_COLOR[visual] ?? null

// ── Lap traces ──────────────────────────────────────────────────────────────
/** A fractional sample index at `seconds` into the lap. */
export function indexAtTime(trace: Trace, seconds: number): number {
    const ts = trace.t
    if (seconds <= ts[0]) return 0
    if (seconds >= ts[ts.length - 1]) return ts.length - 1
    let lo = 0, hi = ts.length - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] <= seconds) lo = mid; else hi = mid }
    return lo + (seconds - ts[lo]) / (ts[hi] - ts[lo] || 1)
}
export function channelAt(trace: Trace, key: keyof Trace, index: number): number {
    const series = trace[key]
    const i = Math.floor(index), j = Math.min(series.length - 1, i + 1), f = index - i
    return series[i] + (series[j] - series[i]) * f
}
export function timeAtDistance(trace: Trace, distance: number): number {
    const ds = trace.d
    if (distance <= ds[0]) return trace.t[0]
    if (distance >= ds[ds.length - 1]) return trace.t[ds.length - 1]
    let lo = 0, hi = ds.length - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ds[mid] <= distance) lo = mid; else hi = mid }
    const f = (distance - ds[lo]) / (ds[hi] - ds[lo] || 1)
    return trace.t[lo] + (trace.t[hi] - trace.t[lo]) * f
}

// ── Metrics (lib/analyzeMetrics.ts) ─────────────────────────────────────────
export interface MetricDef {
    id: string; group: string; label: string; unit: string; defaultColor: string
    min: number; max: number; step?: boolean
    value: (trace: Trace, i: number) => number
    format: (v: number) => string
    axisFormat: (v: number) => string
}
const pct = (v: number) => `${Math.round(v * 100)}%`
export const METRICS: MetricDef[] = [
    { id: 'speed', group: 'Driving', label: 'Speed', unit: 'km/h', defaultColor: '#37872D', min: 0, max: 380, value: (t, i) => t.spd[i], format: v => `${Math.round(v)} km/h`, axisFormat: v => String(Math.round(v)) },
    { id: 'rpm', group: 'Driving', label: 'RPM', unit: 'rpm', defaultColor: '#C4162A', min: 0, max: 16000, value: (t, i) => t.rpm[i], format: v => `${Math.round(v).toLocaleString('en-US')} rpm`, axisFormat: v => v === 0 ? '0' : `${Math.round(v / 1000)}k` },
    { id: 'gear', group: 'Driving', label: 'Gear', unit: '', defaultColor: '#5794F2', min: 0.5, max: 8.5, step: true, value: (t, i) => t.gear[i], format: v => `Gear ${Math.round(v)}`, axisFormat: v => String(Math.round(v)) },
    { id: 'throttle', group: 'Driving', label: 'Throttle', unit: '%', defaultColor: '#37872D', min: 0, max: 1, step: true, value: (t, i) => t.thr[i], format: pct, axisFormat: pct },
    { id: 'brake', group: 'Driving', label: 'Brake', unit: '%', defaultColor: '#C4162A', min: 0, max: 1, step: true, value: (t, i) => t.brk[i], format: pct, axisFormat: pct },
    { id: 'steering', group: 'Driving', label: 'Steering', unit: '%', defaultColor: '#BF5FFF', min: -1, max: 1, value: (t, i) => t.str[i], format: v => `${v < 0 ? 'L ' : v > 0 ? 'R ' : ''}${Math.round(Math.abs(v) * 100)}%`, axisFormat: pct },
    { id: 'ers', group: 'Driving', label: 'ERS', unit: '%', defaultColor: '#FADE2A', min: 0, max: 100, value: (t, i) => t.ers[i], format: v => `${v.toFixed(1)}%`, axisFormat: v => `${Math.round(v)}%` },
]
export const METRIC_BY_ID = new Map(METRICS.map(m => [m.id, m]))
export const DEFAULT_DELTA_POSITIVE_COLOR = '#C4162A'
export const DEFAULT_DELTA_NEGATIVE_COLOR = '#37872D'
export const DEFAULT_MAP_CURRENT_COLOR = '#5794F2'
export const DEFAULT_MAP_COMPARISON_COLOR = '#C4162A'

export interface SeriesConfig { metricId: string; color: string; negativeColor?: string; visible: boolean; showYAxis: boolean }

/** A comparison lap's line: 35% of its colour over the panel (AnalyzeTimeChart.tsx blendColor). */
export function blendColor(hex: string): string {
    const match = /^#([0-9a-f]{6})$/i.exec(hex)
    if (!match) return hex
    const value = Number.parseInt(match[1], 16)
    const bg = [0x12, 0x14, 0x1f]
    const rgb = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
    return `#${rgb.map((c, i) => Math.round(c * 0.35 + bg[i] * 0.65).toString(16).padStart(2, '0')).join('')}`
}

// ── Map paints (lib/analyzeMapPaint.ts) ─────────────────────────────────────
type Oklab = [number, number, number]
function hexToOklab(hex: string): Oklab {
    const [r, g, b] = [1, 3, 5].map(i => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
function oklabToHex([L, a, b]: Oklab): string {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    return '#' + [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(c => {
        const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
        return Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')
    }).join('')
}
function rampColors([from, to]: readonly [string, string], steps: number): string[] {
    const [l0, a0, b0] = hexToOklab(from)
    const [l1, a1, b1] = hexToOklab(to)
    const c0 = Math.hypot(a0, b0), c1 = Math.hypot(a1, b1)
    const h0 = Math.atan2(b0, a0)
    const dh = ((Math.atan2(b1, a1) - h0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI
    return Array.from({ length: steps + 1 }, (_, step) => {
        const t = step / steps, c = c0 + (c1 - c0) * t, h = h0 + dh * t
        return oklabToHex([l0 + (l1 - l0) * t, c * Math.cos(h), c * Math.sin(h)])
    })
}
const ERS_STEPS = 20
const SPEED_STEPS = 50
export const ERS_RAMP_DARK = ['#3B528B', '#7CF5D0'] as const
export const HARVEST_RAMP_DARK = ['#5E2A4F', '#FF8FC7'] as const
export const SPEED_RAMP_DARK = ['#4C2A9A', '#FCE36B'] as const
export const SUPERCLIP_COLOR_DARK = '#8C9CF0'
export const INPUT_STATE_LABELS = ['Coasting', 'Partial', 'Full throttle', 'Braking'] as const
export const INPUT_COLORS_DARK = ['#8B8D98', '#FFB224', '#30A46C', '#E5484D'] as const
const ERS_COLORS = rampColors(ERS_RAMP_DARK, ERS_STEPS)
const HARVEST_COLORS = rampColors(HARVEST_RAMP_DARK, ERS_STEPS)
const SPEED_COLORS = rampColors(SPEED_RAMP_DARK, SPEED_STEPS)

export interface TrackPaint { translucent: boolean; colorAt: (fraction: number) => string | null }

const binOf = (fraction: number, length: number, binM: number, bins: number) =>
    Math.min(bins - 1, Math.max(0, Math.floor(fraction * length / binM)))

function levelPaint(usage: any, ramp: readonly string[]): TrackPaint | null {
    if (!usage || usage.restricted || usage.level.length === 0 || !(usage.binM > 0)) return null
    const colors = usage.level.map((level: number) => ramp[Math.round(clamp(level, 0, 1) * ERS_STEPS)])
    return { translucent: false, colorAt: f => colors[binOf(f, usage.trackLengthM, usage.binM, colors.length)] }
}
export function dominancePaint(result: any, currentColor: string, comparisonColor: string): TrackPaint | null {
    const { faster } = result.dominance
    if (!faster?.length) return null
    const colors = faster.map((v: number) => v === 0 ? currentColor : v === 1 ? comparisonColor : '#ffffff')
    return { translucent: false, colorAt: f => colors[Math.min(colors.length - 1, Math.max(0, Math.floor(f * colors.length)))] }
}
export const ersPaint = (usage: any) => levelPaint(usage, ERS_COLORS)
export function harvestPaint(harvest: any): TrackPaint | null {
    const paint = levelPaint(harvest, HARVEST_COLORS)
    if (!paint || !harvest.superclip.some(Boolean)) return paint
    const bins = harvest.superclip.length
    return {
        translucent: false,
        colorAt: f => harvest.superclip[binOf(f, harvest.trackLengthM, harvest.binM, bins)] ? SUPERCLIP_COLOR_DARK : paint.colorAt(f),
    }
}
export function inputsPaint(inputs: any): TrackPaint | null {
    if (!inputs?.state?.length || !(inputs.binM > 0) || !(inputs.trackLengthM > 0)) return null
    const colors = inputs.state.map((s: number) => INPUT_COLORS_DARK[s] ?? INPUT_COLORS_DARK[0])
    return { translucent: false, colorAt: f => colors[binOf(f, inputs.trackLengthM, inputs.binM, colors.length)] }
}
export function speedPaint(speed: any, minKph: number, maxKph: number): TrackPaint | null {
    if (!speed?.speedKph?.length || !(speed.binM > 0) || !(speed.trackLengthM > 0)) return null
    const span = maxKph - minKph
    const colors = speed.speedKph.map((kph: number) =>
        SPEED_COLORS[span > 0 ? Math.round(clamp((kph - minKph) / span, 0, 1) * SPEED_STEPS) : SPEED_STEPS])
    return { translucent: false, colorAt: f => colors[binOf(f, speed.trackLengthM, speed.binM, colors.length)] }
}
export const rampGradient = (ramp: readonly string[]) => `linear-gradient(in oklch to right, ${ramp.join(', ')})`
