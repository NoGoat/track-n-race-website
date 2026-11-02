// The Analysis tour island (pages/analysis.astro): a copy of Track N Race 1.7.0's Analysis screen in its window,
// title bar (app/components/AppHeaderMacOS.tsx) and playback bar, fed by two race recordings. On load, the run
// (Tour.tsx) builds the screen one part at a time, then leaves it as a playground.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChartNoAxesCombined, Columns3, FileText, Pencil, Settings2, Smartphone, Upload, X } from 'lucide-react'
import '../../styles/analysis-app.css'
import Select, { buildSelectStyles, pagePortal, selectComponents } from './select'
import Screen, { AnalysisHelpItem, BUTTON_CLASS, HELP_INTERACTIONS, HELP_ITEMS, SyncedTooltipIcon, lapOptions } from './Screen'
import PlaybackBar from './PlaybackBar'
import { createClock, useClock } from './clock'
import { AppCtx, type AnalyzeConfig, type AppState, type FixedLapMode } from './ctx'
import { RUN_RPM_COLOR, useRun, type AimOptions, type AimTarget } from './Tour'
import { mapHooks } from './MapPane'
import { registerCamera, setCanvasBoost, toCamera } from './camera'
import {
    FILES, METRIC_BY_ID, fmtClock, loadRecording, loadTrackMap, reducedMotion,
    DEFAULT_DELTA_NEGATIVE_COLOR, DEFAULT_DELTA_POSITIVE_COLOR, type TourData,
} from './lib'

// The series in the screenshot this copies: Delta, Throttle, Speed, ERS, Brake as individual graphs over sectors
const DEFAULT_CONFIG: AnalyzeConfig = {
    collapsed: false, view: 'graph', individualGraphs: true, syncedTooltip: false, sectorBoundaries: true, sectorDelta: false,
    splitCursors: true, brakingPoints: false, inputPanel: false, mapColoring: 'none',
    currentLabel: '', compareLabel: '', lapALabel: '', lapBLabel: '',
    // Lap A green, Lap B rose (the site's --trace-pink, home.css)
    mapCurrentColor: '#228260', mapComparisonColor: '#F279AE',
    series: [
        { metricId: 'delta', color: DEFAULT_DELTA_POSITIVE_COLOR, negativeColor: DEFAULT_DELTA_NEGATIVE_COLOR, visible: true, showYAxis: true },
        { metricId: 'throttle', color: METRIC_BY_ID.get('throttle')!.defaultColor, visible: true, showYAxis: true },
        { metricId: 'speed', color: '#FADE2A', visible: true, showYAxis: true },
        { metricId: 'ers', color: '#0EA5E9', visible: true, showYAxis: true },
        { metricId: 'brake', color: METRIC_BY_ID.get('brake')!.defaultColor, visible: true, showYAxis: true },
    ],
}
const WINDOW_MIN_W = 1180
// The window fills the screen under the site's header, like the app on a laptop
const windowHeight = () => Math.max(640, Math.min(880, (typeof innerHeight === 'number' ? innerHeight : 900) - 60 - 28))
const tabSelectStyles = buildSelectStyles({ menuWidth: '120px' })
const windowSelectStyles = buildSelectStyles({ labelStyleGroupHeadings: true, menuWidth: '7rem', scrollableMenu: false })
const driverSelectStyles = buildSelectStyles({ menuWidth: '240px' })
const TAB_OPTIONS = [{ value: 'analyze', label: 'Analysis' }]
// What the playground keeps: where the run ends, Lap A / Lap B on the full map with Braking Points and the panel on
const PLAYGROUND: Partial<AnalyzeConfig> = { view: 'map', mapColoring: 'none', brakingPoints: true, inputPanel: true }
/** The config with a metric charted at the end of the list, as the metric picker adds it */
const withMetric = (c: AnalyzeConfig, id: string): AnalyzeConfig => c.series.some(s => s.metricId === id) ? c
    : { ...c, series: [...c.series, { metricId: id, color: METRIC_BY_ID.get(id)!.defaultColor, visible: true, showYAxis: true }] }
/** The camera's deepest zoom, which the canvases draw for while the run plays */
const CAMERA_MAX_ZOOM = 2.5
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const WINDOW_OPTIONS = [{ label: 'Laps', options: [{ value: 'CL', label: 'Current' }, { value: 'PL', label: 'Previous' }, { value: 'FL', label: 'Fastest' }, { value: 'AL', label: 'All Laps' }] }]

function Modal({ open, onClose, labelledBy, width, children }: { open: boolean; onClose: () => void; labelledBy: string; width: string; children: React.ReactNode }) {
    const [mounted, setMounted] = useState(open)
    const [visible, setVisible] = useState(false)
    useEffect(() => {
        if (open) { setMounted(true); requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true))) }
        else { setVisible(false); const t = setTimeout(() => setMounted(false), 220); return () => clearTimeout(t) }
    }, [open])
    if (!mounted) return null
    return createPortal(<div data-state={visible ? 'open' : 'closed'} role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        className="modal-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-[var(--bg-modal)] backdrop-blur-[2px]"
        onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
        <div className={`modal-panel flex max-h-[calc(100vh-2rem)] ${width} max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] shadow-[0_0_60px_rgba(0,0,0,0.85)]`}>
            {children}
        </div>
    </div>, pagePortal())
}

function TitleTimer({ clock, show }: { clock: ReturnType<typeof createClock>; show: boolean }) {
    const state = useClock(clock)
    return <div className="flex items-center text-sm font-black tabular-nums shrink-0">
        {show && <span className="text-[var(--text-primary)]">{fmtClock(state.time)}</span>}
    </div>
}

function GlobalBar({ app, onSeek }: { app: AppState; onSeek: (time: number) => void }) {
    const state = useClock(app.clock)
    const total = app.data?.sessionTotal ?? 1
    const options = useMemo(() => lapOptions(app.data).map(o => ({ value: o.lapNum, label: String(o.lapNum) })), [app.data])
    return <PlaybackBar compact state={{ currentTime: state.time, isPlaying: state.playing, progressPct: state.time / total, speed: state.speed, totalTime: total }}
        onSeekProgress={p => onSeek(p * total)}
        onSeekBackward={() => onSeek(state.time - 5)} onSeekForward={() => onSeek(state.time + 5)}
        onSpeedChange={speed => app.clock.set({ speed })}
        onTogglePlay={() => { app.clock.set({ playing: !state.playing }); if (!state.playing) app.emit('play') }}
        lapOptions={options} currentLapNum={app.currentLap} onLapSelect={app.seekLap} />
}

export default function App() {
    const [fileId, setFileId] = useState<string | null>(null)
    const [data, setData] = useState<TourData | null>(null)
    const [map, setMap] = useState<any>(null)
    const [loading, setLoading] = useState<string | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [helpOpen, setHelpOpen] = useState(false)
    const [config, save] = useState<AnalyzeConfig>(DEFAULT_CONFIG)
    const [fixed, setFixed] = useState<FixedLapMode>({ enabled: false, lapA: null, lapB: null })
    const [currentLap, setCurrentLap] = useState<number | null>(null)
    const [compareLap, setCompareLapState] = useState<number | null>(null)
    const [dropping, setDropping] = useState(false)
    const [shown, setShown] = useState<Set<string> | 'all'>(() => new Set())
    const [fresh, setFresh] = useState<string | null>(null)
    const [forcedMenu, setForcedMenu] = useState<string | null>(null)
    const shows = useCallback((key: string) => shown === 'all' || shown.has(key), [shown])
    const freshTimer = useRef(0)
    // When the run reveals a control, what it pushes aside glides to its new place: the window is measured before the
    // reveal and after it lays out, and each moved element animates across the difference (only the outermost of a
    // moved block, so content doesn't move twice). Positions are the window's own, so the camera moving doesn't count.
    const flipFrom = useRef<Map<HTMLElement, { x: number; y: number }> | null>(null)
    const measureWindow = () => {
        const win = cameraRef.current?.querySelector<HTMLElement>('.tnr-window')
        if (!win) return null
        const w = win.getBoundingClientRect(), ws = w.width / (win.offsetWidth || w.width) || 1
        const at = new Map<HTMLElement, { x: number; y: number }>()
        win.querySelectorAll('*').forEach(el => {
            if (!(el instanceof HTMLElement) || el.classList.contains('tour-pane') || el.closest('[data-tour="views"]')) return
            const r = el.getBoundingClientRect()
            if (r.width || r.height) at.set(el, { x: (r.left - w.left) / ws, y: (r.top - w.top) / ws })
        })
        return { at, ws }
    }
    useLayoutEffect(() => {
        const before = flipFrom.current
        flipFrom.current = null
        if (!before || reducedMotion()) return
        const after = measureWindow()
        if (!after) return
        const moved = new Map<HTMLElement, { dx: number; dy: number }>()
        for (const [el, b] of before) {
            const a = after.at.get(el)
            if (a && (Math.abs(b.x - a.x) > 0.5 || Math.abs(b.y - a.y) > 0.5)) moved.set(el, { dx: b.x - a.x, dy: b.y - a.y })
        }
        for (const [el, d] of moved) {
            let base = { dx: 0, dy: 0 }
            for (let p = el.parentElement; p; p = p.parentElement) { const m = moved.get(p); if (m) { base = m; break } }
            const rx = d.dx - base.dx, ry = d.dy - base.dy
            if (Math.abs(rx) < 0.5 && Math.abs(ry) < 0.5) continue
            const r = el.getBoundingClientRect()
            const ratio = (r.width / (el.offsetWidth || r.width) || 1) / after.ws
            el.animate([{ transform: `translate(${rx / ratio}px, ${ry / ratio}px)` }, { transform: 'translate(0, 0)' }],
                { duration: 550, easing: 'cubic-bezier(0.2, 0.9, 0.2, 1)', composite: 'add' })
        }
    }, [shown]) // eslint-disable-line react-hooks/exhaustive-deps
    const reveal = useCallback((...keys: string[]) => {
        flipFrom.current = measureWindow()?.at ?? null
        setShown(prev => prev === 'all' ? prev : new Set([...prev, ...keys]))
        setFresh(keys[keys.length - 1])
        clearTimeout(freshTimer.current)
        freshTimer.current = window.setTimeout(() => setFresh(null), 1500)
    }, [])
    const clock = useMemo(() => createClock({ time: 0, playing: false, speed: 1 }), [])
    const fixedClock = useMemo(() => createClock({ time: 0, playing: false, speed: 1 }), [])

    const primary = data ? (fixed.enabled ? data.laps[fixed.lapA ?? -1] : data.laps[currentLap ?? -1]) ?? null : null
    const comparisonRaw = data ? (fixed.enabled ? data.laps[fixed.lapB ?? -1] : data.laps[compareLap ?? -1]) ?? null : null
    const comparison = comparisonRaw && comparisonRaw.lap !== primary?.lap ? comparisonRaw : null
    const primaryRef = useRef(primary)
    primaryRef.current = primary
    const fixedRef = useRef(fixed)
    fixedRef.current = fixed
    const elapsedSource = useCallback(() => fixedRef.current.enabled
        ? fixedClock.get().time
        : clock.get().time - (primaryRef.current?.start ?? 0), [clock, fixedClock])

    // Which lap the session clock is in; playback loops the lap on show, as only it has data
    const lapAt = useCallback((time: number) => {
        if (!data) return null
        let lap: number | null = null
        for (const [n, , , , , start] of data.lapTimes) if (time >= start) lap = n
        return lap
    }, [data])
    useEffect(() => {
        clock.setBounds(time => {
            const lap = primaryRef.current
            if (!fixedRef.current.enabled && lap && time >= lap.start + lap.time) return lap.start
            return time
        })
        fixedClock.setBounds(time => {
            const total = Math.max(primaryRef.current?.time ?? 0, 0)
            return total > 0 && time >= total ? 0 : Math.max(0, time)
        })
        return clock.subscribe(() => {
            const lap = lapAt(clock.get().time)
            setCurrentLap(prev => prev === lap ? prev : lap)
        })
    }, [clock, fixedClock, lapAt])

    const emitRef = useRef<(e: string) => void>(() => { })
    const emit = useCallback((event: string) => emitRef.current(event), [])
    const lastLap = useRef<number | null>(null)
    useEffect(() => {
        if (currentLap !== null && currentLap !== lastLap.current && data?.laps[currentLap]) emit('currentLap')
        lastLap.current = currentLap
    }, [currentLap, data, emit])

    /** Seeking lands in a lap this page has data for: the nearest one */
    const seek = useCallback((time: number) => {
        if (!data) return
        const t = Math.max(0, Math.min(data.sessionTotal, time))
        const lap = lapAt(t)
        if (lap !== null && data.laps[lap]) { clock.set({ time: t }); return }
        const nearest = data.featured.map(n => data.laps[n]).sort((a, b) =>
            Math.min(Math.abs(a.start - t), Math.abs(a.start + a.time - t)) - Math.min(Math.abs(b.start - t), Math.abs(b.start + b.time - t)))[0]
        clock.set({ time: Math.max(nearest.start, Math.min(nearest.start + nearest.time - 0.05, t)) })
    }, [clock, data, lapAt])
    const seekLap = useCallback((lap: number) => { if (data?.laps[lap]) clock.set({ time: data.laps[lap].start }) }, [clock, data])
    const setCompareLap = useCallback((lap: number | null) => { setCompareLapState(lap); if (lap !== null) { emit('compareLap'); emit(`compareLap:${lap}`) } }, [emit])

    /** Loads a recording; `laps` opens it in Lap A / Lap B mode on those featured laps (by index) */
    const openFile = useCallback(async (id: string, laps: [number, number] | null = [0, 1]): Promise<TourData | null> => {
        setDialogOpen(false)
        const file = FILES.find(f => f.id === id)!
        setLoading(file.name)
        try {
            const [recording, trackMap] = await Promise.all([loadRecording(id), loadTrackMap(file.trackId),
                new Promise(r => setTimeout(r, reducedMotion() ? 100 : 900))])
            const f = recording.featured
            // The session clock sits in the fastest lap, so Current / Compare has laps too
            clock.set({ time: laps ? recording.laps[f[0]].start : 0, playing: false })
            fixedClock.set({ time: 0, playing: false })
            setFixed(laps ? { enabled: true, lapA: f[laps[0]], lapB: f[laps[1]] } : { enabled: false, lapA: null, lapB: null })
            setCompareLapState(laps ? f[1] : null)
            setCurrentLap(null)
            setData(recording)
            setMap(trackMap)
            setFileId(id)
            setLoading(null)
            return recording
        } catch {
            setLoading(null)
            return null
        }
    }, [clock, fixedClock])
    const closeFile = () => {
        clock.set({ playing: false, time: 0 })
        setData(null); setMap(null); setFileId(null); setCurrentLap(null); setCompareLapState(null)
        save(c => ({ ...c, view: 'graph', mapColoring: 'none', brakingPoints: false, inputPanel: false }))
    }

    // The run's camera: zooms and pans the window (and the pop-ups portalled into it). Zoomed in, the stage holding it
    // leaves the page and fills the browser window under the site's header (`full`, from `top`) over a backdrop that
    // fades in (`backdrop`), the camera
    // then placing the window on the screen; zoomed out, the backdrop fades as it eases back to the window's place in
    // the page, and the stage drops back into it.
    const stageRef = useRef<HTMLDivElement>(null)
    const cameraRef = useRef<HTMLDivElement>(null)
    const cameraPortalRef = useRef<HTMLDivElement>(null)
    const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1, ms: 0, full: false, backdrop: false, top: 0 })
    const cameraState = useRef(camera)
    cameraState.current = camera
    const homeTimer = useRef(0)
    useLayoutEffect(() => {
        registerCamera(cameraRef.current, cameraPortalRef.current)
        return () => registerCamera(null, null)
    }, [])
    /** Eases the camera so the targets sit in the middle of the browser window below the site's header, filling about
     *  1/pad of it (never smaller than the window in the page); no targets brings the window back to its place in the
     *  page */
    const aim = useCallback((targets: AimTarget[] | null, { pad = 1.8, max = CAMERA_MAX_ZOOM, ms = 900 }: AimOptions = {}) => {
        clearTimeout(homeTimer.current)
        const cameraEl = cameraRef.current, win = cameraEl?.querySelector('.tnr-window'), frameEl = frameRef.current
        if (!cameraEl || !win || !frameEl) return
        // The full stage starts under the site's header (hidden on phones); where the frame sits in the page is the
        // screen position the window comes from and returns to, in the stage's coordinates
        const headerH = cameraState.current.full ? cameraState.current.top : Math.max(0, document.querySelector('.navbar')?.getBoundingClientRect().bottom ?? 0)
        const frameRect = frameEl.getBoundingClientRect()
        const home = { left: frameRect.left, top: frameRect.top - headerH }
        const boxes = (targets ?? []).flatMap(t => t ? [toCamera(t instanceof Element ? t.getBoundingClientRect() : t)] : [])
        if (!boxes.length) {
            if (!cameraState.current.full) return
            setCamera({ x: home.left, y: home.top, scale: 1, ms, full: true, backdrop: false, top: headerH })
            homeTimer.current = window.setTimeout(() => setCamera({ x: 0, y: 0, scale: 1, ms: 0, full: false, backdrop: false, top: 0 }), ms)
            return
        }
        // The targets in the camera's own coordinates, centred in the browser window
        const viewW = document.documentElement.clientWidth, viewH = window.innerHeight - headerH
        const left = Math.min(...boxes.map(b => b.left)), top = Math.min(...boxes.map(b => b.top))
        const right = Math.max(...boxes.map(b => b.left + b.width)), bottom = Math.max(...boxes.map(b => b.top + b.height))
        const fit = Math.min(viewW / (Math.max(1, right - left) * pad), viewH / (Math.max(1, bottom - top) * pad))
        const scale = clamp(fit, 1, max)
        const target = {
            x: viewW / 2 - scale * (left + right) / 2,
            y: viewH / 2 - scale * (top + bottom) / 2,
            scale, ms, full: true, backdrop: true, top: headerH,
        }
        if (cameraState.current.full) { setCamera(target); return }
        // Out of the page: first the stage fills the screen with the window where it was, then the camera moves
        setCamera({ x: home.left, y: home.top, scale: 1, ms: 0, full: true, backdrop: false, top: headerH })
        requestAnimationFrame(() => requestAnimationFrame(() => setCamera(target)))
    }, [])

    // The map layers' split view (Tour.tsx): the sidebar and the map leave the window for two panes of their own, the
    // sidebar sliding down into the left quarter of the screen and the map in from the right into the rest. The
    // sidebar is scaled to its pane's width and stretched to its height; the map is resized to its pane, so it redraws
    // to fill it. The rest of the window hides; the sidebar's menus portal into it while it's a pane.
    const split = useRef<{ token: number; leave: ((ms: number) => Promise<void>) | null }>({ token: 0, leave: null })
    const layerSplit = useCallback(async (on: boolean, ms = 900): Promise<void> => {
        const token = ++split.current.token
        const sleep = (t: number) => new Promise<void>(r => setTimeout(r, t))
        if (!on) {
            const leave = split.current.leave
            split.current.leave = null
            await leave?.(ms)
            return
        }
        const cameraEl = cameraRef.current, frameEl = frameRef.current
        const win = cameraEl?.querySelector<HTMLElement>('.tnr-window')
        const aside = win?.querySelector<HTMLElement>('aside'), maps = win?.querySelector<HTMLElement>('[data-tour="maps"]')
        if (!cameraEl || !frameEl || !win || !aside || !maps) return
        // The stage fills the screen with the window at its place in the page, over the backdrop
        clearTimeout(homeTimer.current)
        const wasFull = cameraState.current.full
        const headerH = wasFull ? cameraState.current.top : Math.max(0, document.querySelector('.navbar')?.getBoundingClientRect().bottom ?? 0)
        const frameRect = frameEl.getBoundingClientRect()
        setCamera({ x: frameRect.left, y: frameRect.top - headerH, scale: 1, ms: wasFull ? ms : 0, full: true, backdrop: true, top: headerH })
        await sleep(wasFull ? ms : 600)
        if (split.current.token !== token) return
        // The window fades out
        win.style.transition = 'opacity 0.4s ease'
        win.style.opacity = '0'
        await sleep(420)
        if (split.current.token !== token) { win.style.opacity = ''; win.style.transition = ''; return }

        // The panes, in screen pixels: the left quarter and the rest, inside a margin, below the site's header
        const W = document.documentElement.clientWidth, H = window.innerHeight, gap = 20
        const leftPane = { x: gap, y: headerH + gap, w: W * 0.25 - gap * 1.5, h: H - headerH - gap * 2 }
        const rightPane = { x: W * 0.25 + gap / 2, y: headerH + gap, w: W * 0.75 - gap * 1.5, h: H - headerH - gap * 2 }
        // `k` is screen pixels per element pixel at rest (the window's own scale on narrow screens). The sidebar is
        // scaled to its pane's width and made as tall as the pane; the map keeps its scale and takes the pane's size
        const a0 = aside.getBoundingClientRect(), m0 = maps.getBoundingClientRect()
        const k = a0.width / (aside.offsetWidth || a0.width) || 1
        const asideScale = leftPane.w / (aside.offsetWidth || 1)
        const asideH = leftPane.h / asideScale
        const place = (at: { x: number; y: number }, from: DOMRect, scale: number, dx = 0, dy = 0) =>
            `translate(${(at.x - from.left + dx) / k}px, ${(at.y - from.top + dy) / k}px) scale(${scale / k})`
        const asideIn = place(leftPane, a0, asideScale), asideOut = place(leftPane, a0, asideScale, 0, -(leftPane.y + leftPane.h + 40))
        const mapsIn = place(rightPane, m0, k), mapsOut = place(rightPane, m0, k, W - rightPane.x + 40)

        // Out of the window's clipping, onto cards, the rest of the window hidden
        const opened: [HTMLElement, string][] = []
        for (const el of [aside, maps]) for (let p: HTMLElement | null = el; p && p !== cameraEl; p = p.parentElement) {
            opened.push([p, p.style.overflow])
            p.style.overflow = 'visible'
        }
        // Sizes to restore: the sidebar above the map (its menus overhang onto the map's pane), as tall as its pane; the
        // map out of its column's flex sizing, at its pane's size
        const sizes = [aside.style.position, aside.style.zIndex, aside.style.height, maps.style.flex, maps.style.width, maps.style.height]
        aside.style.position = 'relative'
        aside.style.zIndex = '2'
        aside.style.height = `${asideH}px`
        maps.style.flex = 'none'
        maps.style.width = `${rightPane.w / k}px`
        maps.style.height = `${rightPane.h / k}px`
        const portal = document.createElement('div')
        portal.className = 'tnr-portal tour-camera-portal'
        aside.append(portal)
        registerCamera(aside, portal)
        for (const [el, from] of [[aside, asideOut], [maps, mapsOut]] as const) {
            el.classList.add('tour-pane')
            el.style.transformOrigin = '0 0'
            el.style.transition = 'none'
            el.style.transform = from
        }
        win.dataset.split = 'true'
        win.style.transition = 'none'
        win.style.opacity = '1'
        void aside.offsetWidth
        // The sidebar slides down, the map in from the right
        const slide = `transform ${ms}ms cubic-bezier(0.2, 0.9, 0.2, 1)`
        aside.style.transition = slide
        aside.style.transform = asideIn
        await sleep(150)
        maps.style.transition = slide
        maps.style.transform = mapsIn

        split.current.leave = async (outMs: number) => {
            // The panes slide back the way they came, then the window fades back in at its place
            if (outMs > 0) {
                const back = `transform ${outMs * 0.8}ms cubic-bezier(0.65, 0, 0.35, 1)`
                aside.style.transition = maps.style.transition = back
                aside.style.transform = asideOut
                maps.style.transform = mapsOut
                await sleep(outMs * 0.8)
            }
            win.style.transition = 'none'
            win.style.opacity = '0'
            for (const el of [aside, maps]) {
                el.classList.remove('tour-pane')
                el.style.transform = el.style.transformOrigin = el.style.transition = ''
            }
            for (const [el, overflow] of opened.reverse()) el.style.overflow = overflow
            ;[aside.style.position, aside.style.zIndex, aside.style.height, maps.style.flex, maps.style.width, maps.style.height] = sizes
            portal.remove()
            registerCamera(cameraEl, cameraPortalRef.current)
            delete win.dataset.split
            void win.offsetWidth
            if (outMs > 0) {
                win.style.transition = 'opacity 0.4s ease'
                win.style.opacity = '1'
                await sleep(420)
            }
            win.style.transition = win.style.opacity = ''
        }
        await sleep(ms)
    }, [])

    const dataRef = useRef(data); dataRef.current = data
    const configRef = useRef(config); configRef.current = config
    const run = useRun({
        reveal,
        revealAll: () => setShown('all'),
        load: async id => { await openFile(id, null) },
        data: () => dataRef.current,
        openMenu: setForcedMenu,
        aim,
        layerSplit,
        setLap: (which, lap) => {
            setFixed(f => ({ ...f, enabled: true, [which === 'lapA' ? 'lapA' : 'lapB']: lap }))
            fixedClock.set({ time: 0 })
        },
        setLayer: layer => {
            if (layer !== configRef.current.mapColoring) mapHooks.crossfade?.()
            save(c => ({ ...c, mapColoring: layer as AnalyzeConfig['mapColoring'] }))
        },
        addMetric: id => save(c => withMetric(c, id)),
        metricColor: id => configRef.current.series.find(s => s.metricId === id)?.color ?? null,
        setMetricColor: (id, color) => save(c => ({ ...c, series: c.series.map(s => s.metricId === id ? { ...s, color } : s) })),
        finish: async () => {
            setForcedMenu(null)
            await layerSplit(false, 0)
            aim(null, { ms: 700 })
            const recording = dataRef.current
            if (!recording) await openFile('interlagos', [0, 1])
            else if (!fixedRef.current.enabled || fixedRef.current.lapA === null || fixedRef.current.lapB === null) {
                setFixed({ enabled: true, lapA: recording.featured[0], lapB: recording.featured[1] })
            }
            save(c => {
                const next = withMetric(c, 'rpm')
                return { ...next, ...PLAYGROUND, series: next.series.map(s => s.metricId === 'rpm' ? { ...s, color: RUN_RPM_COLOR } : s) }
            })
            setShown('all')
        },
    })
    // The run starts as the page opens
    useEffect(() => { run.start() }, []) // eslint-disable-line react-hooks/exhaustive-deps
    // The canvases draw sharp enough for the camera's zoom while the run plays
    useEffect(() => { setCanvasBoost(run.running ? CAMERA_MAX_ZOOM : 1) }, [run.running])

    const app: AppState = {
        data, map, fileName: fileId ? FILES.find(f => f.id === fileId)!.name : null, config, save, fixed, setFixed,
        currentLap, compareLap, setCompareLap, seekLap, clock, fixedClock, elapsedSource, primary, comparison,
        lock: null, emit, openHelp: () => setHelpOpen(true), shows, fresh, forcedMenu,
    }

    // The window scales down to fit narrower screens, drawn at its own size. On a phone it takes the whole
    // viewport (the site's header and footer hide) and is shaped to the screen, so landscape fills it.
    const frameRef = useRef<HTMLDivElement>(null)
    const [frame, setFrame] = useState({ width: 1400, scale: 1, height: windowHeight(), mobile: false, portrait: false, x: 0, y: 0 })
    const [rotateDismissed, setRotateDismissed] = useState(false)
    useEffect(() => {
        const el = frameRef.current
        if (!el) return
        const phone = matchMedia('(max-width: 900px), (max-height: 500px)')
        const measure = () => {
            const mobile = phone.matches
            document.documentElement.classList.toggle('tour-mobile', mobile)
            if (mobile) {
                const vw = window.visualViewport?.width ?? innerWidth, vh = window.visualViewport?.height ?? innerHeight
                const width = WINDOW_MIN_W
                const height = Math.round(Math.min(900, Math.max(560, width * vh / vw)))
                const scale = Math.min(vw / width, vh / height)
                setFrame({ width, height, scale, mobile, portrait: vh > vw, x: (vw - width * scale) / 2, y: (vh - height * scale) / 2 })
                return
            }
            const w = el.clientWidth
            const base = { mobile, portrait: false, x: 0, y: 0 }
            setFrame(w >= WINDOW_MIN_W
                ? { ...base, width: w, scale: 1, height: windowHeight() }
                // Narrow screens get the desktop window scaled down, at a desktop window's proportions
                : { ...base, width: WINDOW_MIN_W, scale: w / WINDOW_MIN_W, height: 760 })
        }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(el)
        window.addEventListener('resize', measure)
        window.visualViewport?.addEventListener('resize', measure)
        return () => {
            observer.disconnect()
            window.removeEventListener('resize', measure)
            window.visualViewport?.removeEventListener('resize', measure)
            document.documentElement.classList.remove('tour-mobile')
        }
    }, [])

    // Skipping the run: a click with a mouse, a double tap on a touch screen
    const lastTap = useRef(0)
    const skipPress = (e: React.PointerEvent) => {
        if (e.pointerType === 'mouse') { run.skip(); return }
        const now = performance.now()
        if (now - lastTap.current < 350) { lastTap.current = 0; run.skip() }
        else lastTap.current = now
    }

    const session = data ? { label: 'Race', accent: '#5794F2' } : null

    return <AppCtx.Provider value={app}>
        <div ref={frameRef} className="tour-frame" style={frame.mobile ? undefined : { height: frame.height * frame.scale }}>
            <div ref={stageRef} className={`tour-stage ${camera.full ? 'tour-stage--full' : ''} ${camera.backdrop ? 'tour-stage--backdrop' : ''}`}
                style={camera.full ? { top: camera.top } : undefined}>
            <div ref={cameraRef} className="tour-camera" style={{
                transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
                transition: camera.ms ? `transform ${camera.ms}ms cubic-bezier(0.65, 0, 0.35, 1)` : undefined,
            }}>
            <div className={`tnr-app tnr-window ${dropping ? 'tnr-dropping' : ''}`} id="app"
                style={{
                    width: frame.width, height: frame.height, transformOrigin: 'top left',
                    transform: frame.mobile ? `translate(${frame.x}px, ${frame.y}px) scale(${frame.scale})` : frame.scale < 1 ? `scale(${frame.scale})` : undefined,
                }}
                onDragOver={e => { e.preventDefault(); setDropping(true) }} onDragLeave={() => setDropping(false)}
                onDrop={e => { e.preventDefault(); setDropping(false); if (!run.running) setDialogOpen(true) }}>
                <div className="tnr-traffic" aria-hidden="true"><i /><i /><i /></div>
                <header className="relative flex items-center gap-3 pl-20 pr-4 h-10 select-none shrink-0" style={{ background: 'var(--bg-panel)' }}>
                    <div className="w-[118px]">
                        <Select value={TAB_OPTIONS[0]} options={TAB_OPTIONS} styles={tabSelectStyles} components={selectComponents} isSearchable={false}
                            formatOptionLabel={(o: any) => <span className="flex min-w-0 items-center gap-2"><ChartNoAxesCombined aria-hidden="true" className="shrink-0" size={13} strokeWidth={1.8} /><span className="truncate">{o.label}</span></span>} />
                    </div>
                    {app.fileName ? shows('session') && <div className="rv flex items-center gap-1.5 shrink-0">
                        <span className="titlebar-filename text-[11px] font-mono text-[var(--text-secondary)] truncate" title={app.fileName}>{app.fileName}</span>
                        <button onClick={closeFile} title="Close session data" className="p-1 text-[var(--text-secondary)] hover:text-[#e10600] transition-colors"><X size={14} /></button>
                    </div> : loading && run.running
                        // While the run loads the file, the title bar shows it loading where the camera is looking
                        ? <div className="tour-load flex items-center gap-2 shrink-0" role="status" aria-label={`Loading ${loading}`}>
                            <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-[var(--border-focus)] border-t-[var(--color-info)]" />
                            <span className="relative min-w-0">
                                <span className="tour-load__name block max-w-[260px] truncate text-[11px] font-mono text-[var(--text-secondary)]">{loading}</span>
                                <span className="tour-load__bar" />
                            </span>
                        </div>
                        : shows('open-file') && <button data-tour="open-file" onClick={() => setDialogOpen(true)} title="Load Session Data File (.tnrd)"
                        className="rv p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"><Upload size={14} /></button>}
                    {!shows('session') ? null : session
                        ? <span className="rv text-[10px] font-medium uppercase tracking-wide rounded px-2 py-0.5 select-none shrink-0" style={{ backgroundColor: session.accent + '22', color: session.accent }}>{session.label}</span>
                        : <span className="text-[10px] font-medium uppercase tracking-wide rounded px-2 py-0.5 select-none shrink-0 bg-[var(--bg-panel)] text-[var(--text-secondary)]">Offline</span>}
                    <div className="flex-1 min-w-0" />
                    {shows('session') && <div className="rv"><TitleTimer clock={clock} show={!!data} /></div>}
                    {data && shows('session') && <div className="rv" title="This recording saved only your driver.">
                        <Select value={{ value: 0, label: data.driver.name }} options={[{ value: 0, label: data.driver.name }]} isDisabled styles={driverSelectStyles}
                            components={selectComponents} isSearchable={false}
                            formatOptionLabel={(o: any) => <span className="font-bold uppercase">{o.label}</span>} />
                    </div>}
                    {shows('rest') && <div className="rv flex items-center gap-3">
                    <div className="w-[96px]">
                        <Select defaultValue={WINDOW_OPTIONS[0].options[0]} options={WINDOW_OPTIONS} styles={windowSelectStyles} components={selectComponents} isSearchable={false} />
                    </div>
                    <button title="Settings" className="p-1.5 rounded transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--border)]"><Settings2 size={13} /></button>
                    <button disabled aria-label="Sector Boundaries" className="p-1.5 rounded transition-colors text-[var(--text-inactive)] cursor-not-allowed"><Columns3 size={13} /></button>
                    <button disabled aria-label="Synchronize Tooltip" className="p-1.5 rounded transition-colors text-[var(--text-inactive)] cursor-not-allowed"><SyncedTooltipIcon size={13} /></button>
                    <button disabled title="Edit layout" className="p-1.5 rounded transition-colors text-[var(--text-inactive)] cursor-not-allowed"><Pencil size={13} /></button>
                    </div>}
                </header>
                <div className="flex-1 min-h-0">
                    <Screen />
                </div>
                {data && shows('rest') && <div className="rv"><GlobalBar app={app} onSeek={seek} /></div>}
                {loading && !run.running && <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--bg-modal)]">
                    <div className="flex flex-col items-center gap-3">
                        <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-focus)] border-t-[var(--color-info)]" />
                        <span className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Loading session data</span>
                        <span className="max-w-[420px] truncate text-[10px] text-[var(--text-muted)]">{loading}</span>
                    </div>
                </div>}
            </div>
            {/* The window's pop-ups (select menus, pickers) render here, so the camera moves them with the window */}
            <div ref={cameraPortalRef} className="tnr-portal tour-camera-portal" />
            </div>
            {/* While the run builds the screen, a click anywhere on the window (or the screen it fills) skips to the end */}
            {run.running && <div className="absolute inset-0 z-[10001] cursor-pointer" style={{ touchAction: 'manipulation' }} onPointerDown={skipPress} aria-hidden="true" />}
            </div>
        </div>

        {frame.mobile && frame.portrait && !rotateDismissed && <div className="tour-rotate" role="status">
            <Smartphone className="tour-rotate-icon" size={22} aria-hidden="true" />
            <span>Rotate your phone to landscape for a better experience</span>
            <button type="button" onClick={() => setRotateDismissed(true)} aria-label="Dismiss"><X size={16} /></button>
        </div>}

        <Modal open={dialogOpen} onClose={() => setDialogOpen(false)} labelledBy="open-title" width="w-[560px]">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-4" data-tour="open-dialog">
                <div>
                    <div id="open-title" className="text-xs font-mono font-bold uppercase tracking-widest text-[var(--text-primary)]">Load Session Data</div>
                    <div className="mt-1 text-[10px] font-mono uppercase tracking-wider text-[var(--text-secondary)]">Documents › Track-N-Race</div>
                </div>
                <button type="button" onClick={() => setDialogOpen(false)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:text-[#e10600]"><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-2 p-5">
                {FILES.map(file => <button key={file.id} type="button" data-tour={`file-${file.id}`} onClick={() => openFile(file.id)}
                    className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)]/30 p-3 text-left transition-colors hover:border-[var(--border-focus)] hover:bg-[var(--bg-hover)]">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[var(--border-focus)] text-white"><FileText size={15} /></span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">{file.track} · Race</span>
                        <span className="mt-0.5 block truncate text-[10px] text-[var(--text-secondary)]">{file.name}</span>
                    </span>
                    <span className="shrink-0 text-right text-[10px] text-[var(--text-secondary)] tabular-nums">{file.laps} laps<br />{file.size}</span>
                </button>)}
            </div>
            <div className="flex shrink-0 justify-end border-t border-[var(--border)] bg-[var(--bg-card)]/10 px-6 py-4">
                <button type="button" onClick={() => setDialogOpen(false)} className={BUTTON_CLASS}>Cancel</button>
            </div>
        </Modal>

        <Modal open={helpOpen} onClose={() => setHelpOpen(false)} labelledBy="analysis-controls-help-title" width="w-[680px]">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-4">
                <div>
                    <div id="analysis-controls-help-title" className="text-xs font-mono font-bold uppercase tracking-widest text-[var(--text-primary)]">Analysis Controls</div>
                    <div className="mt-1 text-[10px] font-mono uppercase tracking-wider text-[var(--text-secondary)]">Views, chart options, and interactions</div>
                </div>
                <button type="button" onClick={() => setHelpOpen(false)} aria-label="Close Analysis controls help" className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:text-[#e10600]"><X size={18} /></button>
            </div>
            <div className="min-h-0 overflow-y-auto p-5">
                <div className="mb-2 text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Sidebar controls</div>
                <div className="grid grid-cols-2 gap-2">{HELP_ITEMS.map(([icon, label, text]) => <AnalysisHelpItem key={label} icon={icon} label={label}>{text}</AnalysisHelpItem>)}</div>
                <div className="mb-2 mt-5 text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Chart interactions</div>
                <div className="grid grid-cols-2 gap-2">{HELP_INTERACTIONS.map(([icon, label, text]) => <AnalysisHelpItem key={label} icon={icon} label={label}>{text}</AnalysisHelpItem>)}</div>
            </div>
            <div className="flex shrink-0 justify-end border-t border-[var(--border)] bg-[var(--bg-card)]/10 px-6 py-4">
                <button type="button" onClick={() => setHelpOpen(false)} className={BUTTON_CLASS}>Close</button>
            </div>
        </Modal>

    </AppCtx.Provider>
}
