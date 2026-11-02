// The run's camera (Tour.tsx): App wraps the window in an element it can zoom and pan, which also holds the portal the
// window's pop-ups render into, so menus and pickers move with what they belong to. Pop-ups are placed from the
// screen rects of their controls; toCamera turns those into the camera's own coordinates. While the run plays, the
// canvases draw at a higher resolution so a zoomed-in chart or map stays sharp.
import { useEffect, useReducer } from 'react'

let cameraEl: HTMLElement | null = null
let portalEl: HTMLElement | null = null
export function registerCamera(camera: HTMLElement | null, portal: HTMLElement | null) {
    cameraEl = camera
    portalEl = portal
}
/** Where pop-ups render: the portal inside the camera, once it is mounted */
export const cameraPortal = () => portalEl

export interface Box { left: number; top: number; width: number; height: number }
/** A screen rect in the camera's untransformed coordinates (its pop-ups' `fixed` / `absolute` positions), and the
 *  camera's current scale */
export function toCamera(rect: Box): Box & { scale: number } {
    if (!cameraEl) return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, scale: 1 }
    const c = cameraEl.getBoundingClientRect()
    const scale = c.width / (cameraEl.offsetWidth || c.width) || 1
    return { left: (rect.left - c.left) / scale, top: (rect.top - c.top) / scale, width: rect.width / scale, height: rect.height / scale, scale }
}

// ── Canvas resolution ────────────────────────────────────────────────────────
let boost = 1
const listeners = new Set<() => void>()
/** Raises the canvases' resolution by `value` (the camera's deepest zoom) while the run plays; 1 puts it back */
export function setCanvasBoost(value: number) {
    if (value === boost) return
    boost = value
    listeners.forEach(listener => listener())
}
/** The current boost; a component drawing a canvas redraws when it changes */
export function useCanvasBoost(): number {
    const [, rerender] = useReducer((n: number) => n + 1, 0)
    useEffect(() => { listeners.add(rerender); return () => { listeners.delete(rerender) } }, [])
    return boost
}
const PIXEL_BUDGET = 8_000_000
/** Device pixels per CSS pixel for a canvas of `width` × `height`: the screen's density (up to 2), raised by the boost
 *  within a budget of device pixels per canvas */
export function canvasDpr(width: number, height: number): number {
    const base = Math.min(window.devicePixelRatio || 1, 2)
    const cap = Math.sqrt(PIXEL_BUDGET / Math.max(1, width * height))
    return Math.min(base * boost, Math.max(base, cap))
}
