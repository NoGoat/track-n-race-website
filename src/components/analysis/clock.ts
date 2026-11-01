// Playback clocks. The session clock drives the window's playback bar (Current/Compare mode); the fixed clock is
// the map's own bar in Comparison mode. Both tick in requestAnimationFrame and notify subscribers at most every
// frame; the map and charts read them directly each frame instead of re-rendering.
import { useSyncExternalStore } from 'react'

export interface ClockState { time: number; playing: boolean; speed: number }

export function createClock(initial: ClockState) {
    let state = initial
    const listeners = new Set<() => void>()
    let bounds: (time: number) => number = t => t
    let onTick: ((state: ClockState) => void) | null = null
    let frame = 0
    let last = 0
    const emit = () => listeners.forEach(fn => fn())
    const loop = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000)
        last = now
        if (state.playing) {
            state = { ...state, time: bounds(state.time + dt * state.speed) }
            onTick?.(state)
            emit()
            frame = requestAnimationFrame(loop)
        } else frame = 0
    }
    return {
        get: () => state,
        set(next: Partial<ClockState>) {
            const wasPlaying = state.playing
            state = { ...state, ...next }
            if (state.playing && !wasPlaying && !frame) { last = performance.now(); frame = requestAnimationFrame(loop) }
            onTick?.(state)
            emit()
        },
        /** Where a tick may go: playback loops the lap on show, as only it has data */
        setBounds(fn: (time: number) => number) { bounds = fn },
        onTick(fn: (state: ClockState) => void) { onTick = fn },
        subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
    }
}
export type Clock = ReturnType<typeof createClock>

export function useClock(clock: Clock): ClockState {
    return useSyncExternalStore(clock.subscribe, clock.get, clock.get)
}
