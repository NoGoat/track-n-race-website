// The Analysis tour island (pages/analysis.astro): a copy of Track N Race 1.7.0's Analysis screen in its window,
// title bar (app/components/AppHeaderMacOS.tsx) and playback bar, fed by two race recordings. On load, the run
// (Tour.tsx) builds the screen one part at a time, then leaves it as a playground.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChartNoAxesCombined, Columns3, FileText, Pencil, Settings2, Smartphone, Upload, X } from 'lucide-react'
import '../../styles/analysis-app.css'
import Select, { buildSelectStyles, portalTarget, selectComponents } from './select'
import Screen, { AnalysisHelpItem, BUTTON_CLASS, HELP_INTERACTIONS, HELP_ITEMS, SyncedTooltipIcon, lapOptions } from './Screen'
import PlaybackBar from './PlaybackBar'
import { createClock, useClock } from './clock'
import { AppCtx, type AnalyzeConfig, type AppState, type FixedLapMode } from './ctx'
import { useRun } from './Tour'
import {
    FILES, METRIC_BY_ID, fmtClock, loadRecording, loadTrackMap, reducedMotion,
    DEFAULT_DELTA_NEGATIVE_COLOR, DEFAULT_DELTA_POSITIVE_COLOR, type TourData,
} from './lib'

// The series in the screenshot this copies: Delta, Throttle, Speed, ERS, Brake as individual graphs over sectors
const DEFAULT_CONFIG: AnalyzeConfig = {
    collapsed: false, view: 'graph', individualGraphs: true, syncedTooltip: false, sectorBoundaries: true, sectorDelta: false,
    splitCursors: true, brakingPoints: false, inputPanel: false, mapColoring: 'none',
    currentLabel: '', compareLabel: '', lapALabel: '', lapBLabel: '',
    // Lap A green, Lap B mauve
    mapCurrentColor: '#96F359', mapComparisonColor: '#B276AD',
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
    </div>, portalTarget())
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
    const reveal = useCallback((...keys: string[]) => {
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

    const dataRef = useRef(data); dataRef.current = data
    const run = useRun({
        reveal,
        revealAll: () => setShown('all'),
        load: async id => { await openFile(id, null) },
        data: () => dataRef.current,
        openMenu: setForcedMenu,
        setLap: (which, lap) => {
            setFixed(f => ({ ...f, enabled: true, [which === 'lapA' ? 'lapA' : 'lapB']: lap }))
            fixedClock.set({ time: 0 })
        },
        setLayer: layer => save(c => ({ ...c, mapColoring: layer as AnalyzeConfig['mapColoring'] })),
        finish: async () => {
            setForcedMenu(null)
            const recording = dataRef.current
            if (!recording) await openFile('interlagos', [0, 1])
            else if (!fixedRef.current.enabled || fixedRef.current.lapA === null || fixedRef.current.lapB === null) {
                setFixed({ enabled: true, lapA: recording.featured[0], lapB: recording.featured[1] })
            }
            save(c => ({ ...c, ...PLAYGROUND }))
            setShown('all')
        },
    })
    // The run starts as the page opens
    useEffect(() => { run.start() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
                    </div> : shows('open-file') && <button data-tour="open-file" onClick={() => setDialogOpen(true)} title="Load Session Data File (.tnrd)"
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
                {/* While the run builds the screen, a click anywhere on the window skips to the end */}
                {run.running && <div className="absolute inset-0 z-[70] cursor-pointer" style={{ touchAction: 'manipulation' }} onPointerDown={skipPress} aria-hidden="true" />}
                {loading && <div className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--bg-modal)]">
                    <div className="flex flex-col items-center gap-3">
                        <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-focus)] border-t-[var(--color-info)]" />
                        <span className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Loading session data</span>
                        <span className="max-w-[420px] truncate text-[10px] text-[var(--text-muted)]">{loading}</span>
                    </div>
                </div>}
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
