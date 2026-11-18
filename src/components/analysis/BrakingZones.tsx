// The Braking Zones sidebar (electron-frontend components/AnalyzeBrakingZones.tsx) and the divider that resizes it
// and its two parts (AnalysisPanelHandle.tsx): every braking zone with the time gap through it, the chosen one head
// to head below. Markup, classes and wording ported as written.
import { memo, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { BrakingTooltip } from './MapPane'
import { BRAKING_LEVEL_S, formatM } from './lib'

// The detail card's table needs the minimum width
export const DEFAULT_ZONES_WIDTH = 300
export const MIN_ZONES_WIDTH = 300
export const MAX_ZONES_WIDTH = 640
export const DEFAULT_ZONES_LIST_RATIO = 0.45
const MIN_ZONES_LIST_RATIO = 0.15
const MAX_ZONES_LIST_RATIO = 0.85

/** A divider between two parts of a panel. A wider invisible grip around the line; double-click restores the
 *  default, arrow keys nudge. */
export function AnalysisPanelHandle({
    orientation, label, value, min, max, defaultValue, step, reversed = false, valueAt, onPreview, onCommit,
}: {
    /** The way the divider line runs: `vertical` is dragged left and right */
    orientation: 'vertical' | 'horizontal'
    label: string
    value: number
    min: number
    max: number
    defaultValue: number
    /** Arrow key step; Shift moves five times as far */
    step: number
    /** Dragging right or down makes the value smaller */
    reversed?: boolean
    /** The value with the divider at this pointer position */
    valueAt: (clientX: number, clientY: number) => number
    /** Live value while dragging, applied at most once per animation frame */
    onPreview: (value: number) => void
    /** Final value, to keep */
    onCommit: (value: number) => void
}) {
    const [dragging, setDragging] = useState(false)
    const [hovered, setHovered] = useState(false)
    const [focused, setFocused] = useState(false)
    const latestRef = useRef(value)
    const frameRef = useRef(0)
    const pointerRef = useRef<number | null>(null)

    useEffect(() => { if (!dragging) latestRef.current = value }, [dragging, value])
    useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }, [])

    const clamp = (next: number) => Math.min(max, Math.max(min, next))

    const startDrag = (event: PointerEvent<HTMLDivElement>) => {
        if (!event.isPrimary || event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        pointerRef.current = event.pointerId
        setDragging(true)
    }
    const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
        if (pointerRef.current !== event.pointerId) return
        latestRef.current = clamp(valueAt(event.clientX, event.clientY))
        if (frameRef.current) return
        frameRef.current = requestAnimationFrame(() => {
            frameRef.current = 0
            onPreview(latestRef.current)
        })
    }
    const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
        if (pointerRef.current !== event.pointerId) return
        pointerRef.current = null
        setDragging(false)
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        if (frameRef.current) {
            cancelAnimationFrame(frameRef.current)
            frameRef.current = 0
        }
        onCommit(latestRef.current)
    }
    const nudge = (event: KeyboardEvent<HTMLDivElement>) => {
        const [back, forward] = orientation === 'vertical' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
        const direction = event.key === forward ? 1 : event.key === back ? -1 : 0
        if (!direction) return
        event.preventDefault()
        const next = clamp(latestRef.current + direction * (reversed ? -1 : 1) * step * (event.shiftKey ? 5 : 1))
        latestRef.current = next
        onCommit(next)
    }

    const vertical = orientation === 'vertical'
    return <div className={`relative z-20 shrink-0 ${vertical ? 'w-0' : 'h-px bg-[var(--border)]'}`}>
        <div
            role="separator"
            aria-orientation={orientation}
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((value - min) / (max - min) * 100)}
            tabIndex={0}
            title="Drag to resize · Double-click to reset"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            onDoubleClick={() => {
                latestRef.current = defaultValue
                onCommit(defaultValue)
            }}
            onKeyDown={nudge}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={`absolute touch-none transition-colors focus-visible:outline-none ${vertical
                ? 'inset-y-0 -left-[3px] w-[7px] cursor-col-resize'
                : 'inset-x-0 -top-[3px] h-[7px] cursor-row-resize'}`}
            style={{ backgroundColor: dragging || hovered || focused ? 'color-mix(in srgb, var(--border-focus) 40%, transparent)' : undefined }}
        />
    </div>
}

interface ZoneRow {
    zone: number
    atM: number
    /** The Gap (two laps) or Entry (one lap) cell */
    value: string
    color: string | undefined
    splitM: number
    toM: number
    current: any
    comparison: any
    pair: any
}

const formatGap = (seconds: number) => {
    const value = Math.abs(seconds) < 0.0005 ? 0 : seconds
    return `${value > 0 ? '+' : ''}${value.toFixed(3)}`
}

const ROW_COLUMNS = 'grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 px-3'

/** Every braking zone with the time gap through it; the chosen one head to head below, and the map's cursors moved
 *  to it. */
export default memo(function BrakingZones({
    result, lapChosen, currentLabel, currentColor, comparisonLabel, comparisonColor, onZoneActivated,
    selectRequest, listRatio, onListRatioCommit,
}: {
    /** libtnrp's braking points for the laps on show; null until a lap is chosen */
    result: any | null
    /** A lap is chosen, so a null result is still on its way */
    lapChosen: boolean
    currentLabel: string
    currentColor: string
    comparisonLabel: string
    comparisonColor: string
    /** The user chose a zone: its braking point's lap distance, in metres */
    onZoneActivated: (distanceM: number) => void
    /** A zone clicked on the map, as its row; selected when its seq is new */
    selectRequest?: { row: number; seq: number } | null
    /** The zone list's share of the height above the detail card */
    listRatio: number
    onListRatioCommit: (ratio: number) => void
}) {
    // Live ratio while the divider is dragged; kept on release
    const [draftListRatio, setDraftListRatio] = useState<number | null>(null)
    const shownListRatio = draftListRatio ?? listRatio
    const sectionsRef = useRef<HTMLDivElement>(null)
    const braking = result?.hasCurrent ? result.braking : null
    const paired = !!braking && braking.comparison.length > 0

    const { rows, currentQuicker, comparisonQuicker } = useMemo(() => {
        const zones: ZoneRow[] = []
        let currentQuicker = 0
        let comparisonQuicker = 0
        if (braking && braking.comparison.length > 0) {
            for (const pair of braking.pairs) {
                const timed = pair.currentTimeS >= 0 && pair.comparisonTimeS >= 0
                // Positive: the current lap was slower through the zone, as the delta reads
                const gap = timed ? pair.currentTimeS - pair.comparisonTimeS : 0
                const decided = timed && Math.abs(gap) >= BRAKING_LEVEL_S
                if (decided) {
                    if (gap > 0) comparisonQuicker += 1
                    else currentQuicker += 1
                }
                zones.push({
                    zone: pair.current + 1, atM: pair.fromM, value: timed ? formatGap(gap) : '—',
                    color: decided ? (gap > 0 ? comparisonColor : currentColor) : undefined,
                    splitM: pair.splitM, toM: pair.toM,
                    current: braking.current[pair.current], comparison: braking.comparison[pair.comparison], pair,
                })
            }
        } else if (braking) {
            braking.current.forEach((point: any, index: number) => zones.push({
                zone: index + 1, atM: point.distanceM, value: `${Math.round(point.speedKph)} km/h`, color: undefined,
                splitM: -1, toM: Math.max(point.distanceM, point.endM),
                current: point, comparison: undefined, pair: undefined,
            }))
        }
        return { rows: zones, currentQuicker, comparisonQuicker }
    }, [braking, comparisonColor, currentColor])

    // The chosen row stays put when the laps change, as far as the new list allows
    const [chosen, setChosen] = useState(0)
    // A zone clicked on the map is chosen; one clicked before the panel opened is not
    const [seenRequest, setSeenRequest] = useState(selectRequest?.seq ?? 0)
    if (selectRequest && selectRequest.seq !== seenRequest) {
        setSeenRequest(selectRequest.seq)
        setChosen(selectRequest.row)
    }
    const selected = Math.min(chosen, rows.length - 1)
    const row = selected >= 0 ? rows[selected] : undefined
    const listRef = useRef<HTMLDivElement>(null)
    const idPrefix = useId()

    useEffect(() => {
        // Scrolls the list only: scrollIntoView would also scroll the page around the window
        const list = listRef.current, option = list?.querySelector<HTMLElement>('[aria-selected="true"]')
        if (!list || !option) return
        const header = 28
        if (option.offsetTop - header < list.scrollTop) list.scrollTop = option.offsetTop - header
        else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight
    }, [selected])

    const choose = (index: number) => {
        setChosen(index)
        onZoneActivated(rows[index].atM)
    }
    const onKeyDown = (event: KeyboardEvent) => {
        const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
        if (step === 0 || rows.length === 0) return
        event.preventDefault()
        const next = Math.max(0, Math.min(rows.length - 1, selected + step))
        if (next !== selected) choose(next)
    }

    const header = <div className="h-11 px-3 flex items-center border-b border-[var(--border)] shrink-0">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-primary)]">Braking Zones</div>
    </div>

    if (!braking) return <div className="h-full flex flex-col">
        {header}
        {(result || !lapChosen) && <div className="px-3 py-3 text-[11px] text-[var(--text-secondary)]">
            Braking zones show once a lap is chosen.
        </div>}
    </div>

    return <div className="h-full flex flex-col">
        {header}
        <div className="shrink-0 border-b border-[var(--border)] px-3 py-2 text-[10px] leading-snug text-[var(--text-secondary)]">
            {paired
                ? <>{rows.length} zones · <span style={{ color: currentColor }}>{currentLabel}</span> quicker in {currentQuicker}, <span style={{ color: comparisonColor }}>{comparisonLabel}</span> in {comparisonQuicker}</>
                : <>{rows.length} zones · choose a lap to compare for the gaps</>}
        </div>

        <div ref={sectionsRef} className="min-h-0 flex-1 flex flex-col">
            <div
                ref={listRef}
                role="listbox"
                aria-label="Braking zones"
                aria-activedescendant={row ? `${idPrefix}-${selected}` : undefined}
                tabIndex={0}
                onKeyDown={onKeyDown}
                style={row ? { flex: `0 0 ${shownListRatio * 100}%` } : { flex: '1 1 0' }}
                className="relative min-h-0 overflow-y-auto scroll-pt-7 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--border-focus)]"
            >
                <div role="presentation" className={`${ROW_COLUMNS} sticky top-0 z-[1] h-7 bg-[var(--bg-panel)] text-[9px] uppercase tracking-widest text-[var(--text-secondary)]`}>
                    <span>Zone</span>
                    <span>At</span>
                    <span className="text-right">{paired ? 'Gap' : 'Entry'}</span>
                </div>
                {rows.map((zone, index) => <div
                    key={`${zone.zone}-${index}`}
                    id={`${idPrefix}-${index}`}
                    role="option"
                    aria-selected={index === selected}
                    onClick={() => choose(index)}
                    className={`${ROW_COLUMNS} h-7 cursor-pointer text-[11px] tabular-nums transition-colors ${index === selected ? 'bg-[var(--border)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}`}
                >
                    <span>{zone.zone}</span>
                    <span className="font-mono">{formatM(zone.atM)}</span>
                    <span className={`text-right font-mono ${zone.color ? 'font-bold' : ''}`} style={zone.color ? { color: zone.color } : undefined}>{zone.value}</span>
                </div>)}
            </div>

            {row && <AnalysisPanelHandle
                orientation="horizontal"
                label="Resize zone list and detail"
                value={shownListRatio}
                min={MIN_ZONES_LIST_RATIO}
                max={MAX_ZONES_LIST_RATIO}
                defaultValue={DEFAULT_ZONES_LIST_RATIO}
                step={0.01}
                valueAt={(_clientX, clientY) => {
                    const rect = sectionsRef.current?.getBoundingClientRect()
                    return rect && rect.height > 0 ? (clientY - rect.top) / rect.height : shownListRatio
                }}
                onPreview={setDraftListRatio}
                onCommit={ratio => {
                    setDraftListRatio(null)
                    if (ratio !== listRatio) onListRatioCommit(ratio)
                }}
            />}
            {row && <div className="min-h-0 flex-1 overflow-y-auto p-3 text-[10px] text-[var(--text-primary)]">
                <BrakingTooltip
                    fill zone={row.zone} phase={null} fromM={row.atM} splitM={row.splitM} toM={row.toM}
                    current={row.current} comparison={row.comparison} pair={row.pair}
                    currentLabel={currentLabel} comparisonLabel={comparisonLabel}
                    currentColor={currentColor} comparisonColor={comparisonColor}
                />
            </div>}
        </div>
    </div>
})
