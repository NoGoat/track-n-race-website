// The app's playback bar (electron-frontend app/components/PlaybackBar.tsx): seek buttons, play, the progress
// tracker, speed and lap selects and export. `compact` is the map pane's bar in Comparison mode.
import { memo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, Pause, Play } from 'lucide-react'
import Select, { buildSelectStyles, selectComponents } from './select'
import { fmtLap } from './lib'
import { showUnavailable } from './unavailable'

const selectStyles = buildSelectStyles()
export const PLAYBACK_SPEED_OPTIONS = [
    { value: 0.25, label: '0.25x' }, { value: 0.5, label: '0.5x' }, { value: 1, label: '1x' }, { value: 2, label: '2x' },
    { value: 4, label: '4x' }, { value: 8, label: '8x' }, { value: 16, label: '16x' },
]
type LapOption = { value: number; label: string; isDisabled?: boolean }

function ProgressTracker({ compact, currentTime, startTime, onSeekProgress, progressPct, totalTime }: {
    compact: boolean; currentTime: number; startTime: number; onSeekProgress: (p: number) => void; progressPct: number; totalTime: number
}) {
    const dragging = useRef(false)
    const [dragPct, setDragPct] = useState(progressPct)
    const pct = dragging.current ? dragPct : progressPct
    const displayTime = dragging.current ? startTime + dragPct * totalTime : currentTime
    return <div className={`flex-1 flex items-center ${compact ? 'gap-2' : 'gap-4'}`}>
        <span className="text-xs text-[var(--text-secondary)] font-mono tabular-nums">{fmtLap(displayTime)}</span>
        <input type="range" min="0" max="1" step="0.001" value={pct} aria-label="Playback position"
            onMouseDown={() => { dragging.current = true; setDragPct(progressPct) }}
            onTouchStart={() => { dragging.current = true; setDragPct(progressPct) }}
            onMouseUp={() => { dragging.current = false }} onTouchEnd={() => { dragging.current = false }}
            onChange={event => { const v = parseFloat(event.target.value); setDragPct(v); onSeekProgress(v) }}
            className="tnr-range flex-1 h-1.5 bg-[var(--border)] rounded-full outline-none cursor-pointer"
            style={{ background: `linear-gradient(to right, var(--color-info) ${pct * 100}%, var(--border) ${pct * 100}%)` }} />
        <span className="text-xs font-mono text-[var(--text-secondary)] tabular-nums">{fmtLap(startTime + totalTime)}</span>
    </div>
}

export default memo(function PlaybackBar({ compact = false, state, startTime = 0, onSeekProgress, onSeekBackward, onSeekForward, onSpeedChange, onTogglePlay,
    showExport = true, lapOptions, currentLapNum = null, onLapSelect }: {
    compact?: boolean
    state: { currentTime: number; isPlaying: boolean; progressPct: number; speed: number; totalTime: number }
    /** Session time at progress 0 (the map bar counts from the start of the lap). */
    startTime?: number
    onSeekProgress: (p: number) => void
    onSeekBackward: () => void
    onSeekForward: () => void
    onSpeedChange: (speed: number) => void
    onTogglePlay: () => void
    showExport?: boolean
    lapOptions?: LapOption[]
    currentLapNum?: number | null
    onLapSelect?: (lap: number) => void
}) {
    const selectWidth = `${compact ? 'w-[3.5rem]' : 'w-[4.5rem]'} shrink-0`
    const controlSize = compact ? 'w-6 h-6' : 'w-8 h-8'
    const playControlSize = compact ? 'w-6 h-6' : 'w-7 h-7'
    const playIconSize = compact ? 12 : 16
    const chevronIconSize = compact ? 14 : 18
    const speed = PLAYBACK_SPEED_OPTIONS.find(o => o.value === state.speed) ?? PLAYBACK_SPEED_OPTIONS[2]
    const lapValue = currentLapNum !== null && currentLapNum > 0 ? { value: currentLapNum, label: String(currentLapNum) } : null
    return <div className={`${compact ? 'h-10 gap-1' : 'h-14 gap-2'} border-t border-[var(--border)] bg-[var(--bg-panel)] shrink-0 flex items-center pl-1 pr-2 z-40 select-none`}>
        <div className={`flex items-center ${compact ? 'gap-1' : 'gap-3'}`}>
            <button onClick={onSeekBackward} title="Seek backward 5s (-5s)" className={`${controlSize} flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors`}><ChevronLeft size={chevronIconSize} /></button>
            <button type="button" data-tour={compact ? 'map-play' : 'play'} onClick={onTogglePlay} title={state.isPlaying ? 'Pause' : 'Play'} aria-label={state.isPlaying ? 'Pause playback' : 'Play playback'}
                className={`${playControlSize} inline-flex shrink-0 items-center justify-center p-0 leading-none rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors`}>
                {state.isPlaying
                    ? <Pause size={playIconSize} strokeWidth={2} fill="currentColor" className="block" />
                    : <Play size={playIconSize} strokeWidth={2} fill="currentColor" className="block translate-x-[0.5px]" />}
            </button>
            <button onClick={onSeekForward} title="Seek forward 5s (+5s)" className={`${controlSize} flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors`}><ChevronRight size={chevronIconSize} /></button>
        </div>
        <ProgressTracker compact={compact} currentTime={startTime + state.currentTime} startTime={startTime} onSeekProgress={onSeekProgress} progressPct={state.progressPct} totalTime={state.totalTime} />
        <div className="flex items-center gap-1.5 shrink-0">
            <div className={selectWidth}>
                <Select value={speed} onChange={(o: any) => o && onSpeedChange(o.value)} options={PLAYBACK_SPEED_OPTIONS} styles={selectStyles}
                    components={selectComponents} menuPlacement="top" isSearchable={false} />
            </div>
        </div>
        {lapOptions && lapOptions.length > 0 && <div className="flex items-center gap-1.5 shrink-0" data-tour="lap-select">
            <div className={selectWidth}>
                <Select<LapOption> value={lapValue} options={lapOptions} onChange={o => o && onLapSelect?.(o.value)} isSearchable={false}
                    maxMenuHeight={150} menuPlacement="top" styles={selectStyles} components={selectComponents} placeholder="—"
                    isOptionDisabled={o => !!o.isDisabled} inputId="playback-lap" />
            </div>
        </div>}
        {showExport && <button title="Export session to Excel (.xlsx)" onClick={showUnavailable}className={`${controlSize} flex items-center justify-center rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50 shrink-0`}><Download size={16} /></button>}
    </div>
})
