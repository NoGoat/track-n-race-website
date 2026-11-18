// The run that opens the Analysis page. It builds the screen in front of the visitor: the window starts empty,
// then each control appears when it is needed and is used straight away (the real controls, so the results are
// the real results). It loads São Paulo, sets Lap A and Lap B (Fernando Alonso's lap, his car picked first), opens the map and adds the map layers one at a
// time, then reveals everything else and leaves a working playground. RPM is added to the graphs after Lap B and
// recoloured on its card. A camera follows along in scenes: it settles on an area, the controls there appear and are
// used, and it moves on when the action does. A click on the window skips to the end.
import { useCallback, useEffect, useRef, useState } from 'react'
import { chartHooks } from './Charts'
import { mapHooks } from './MapPane'
import { markPoint } from './TrackMap'
import { cameraPortal, toCamera } from './camera'
import { reducedMotion, type TourData } from './lib'

export interface RunApi {
    reveal: (...keys: string[]) => void
    revealAll: () => void
    load: (id: string) => Promise<void>
    data: () => TourData | null
    /** Holds a menu open ('lapA', 'lapB', 'driver:lapB', 'layer', 'metrics'), or closes it with null */
    openMenu: (key: string | null) => void
    /** Sets a lap by its key (LapInfo.key) */
    setLap: (which: 'lapA' | 'lapB', lap: string) => void
    /** Sets a lap group's driver, by driver index */
    setDriver: (which: 'lapA' | 'lapB', driver: number) => void
    /** Charts a metric, if it isn't already */
    addMetric: (id: string) => void
    setMetricColor: (id: string, color: string) => void
    metricColor: (id: string) => string | null
    setLayer: (layer: string) => void
    /** Eases the camera onto the targets; null or none shows the whole window */
    aim: (targets: AimTarget[] | null, options?: AimOptions) => void
    /** Splits the sidebar and the map into two panes of their own for the map layers, or puts them back */
    layerSplit: (on: boolean) => Promise<void>
    /** Puts the screen in the run's final state (laps, view, layer, toggles) and reveals everything */
    finish: () => Promise<void>
}

/** What the camera can look at: an element, or a rect on screen; missing ones are left out */
export type AimTarget = Element | DOMRect | null | undefined
export interface AimOptions {
    /** How much room to leave: the targets fill about 1/pad of the window */
    pad?: number
    /** The deepest zoom */
    max?: number
    /** How long the move takes */
    ms?: number
}

/** RPM's colour once the run recolours it: the site's --trace-periwinkle (home.css) */
export const RUN_RPM_COLOR = '#8c9cf0'

/** A hex colour `t` of the way from `a` to `b`, eased */
function mixHex(a: string, b: string, t: number): string {
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
    const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
    return '#' + [0, 1, 2].map(i => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * e).toString(16).padStart(2, '0')).join('')
}

class Cancelled extends Error { }

const q = (key: string) => document.querySelector(`[data-tour="${key}"]`) as HTMLElement | null

/** A mark's middle in page coordinates */
function markScreenPoint(index: number) {
    const pane = mapHooks.pane, mark = mapHooks.marks[index]
    if (!pane || !mark) return null
    const rect = pane.getBoundingClientRect()
    const scale = rect.width / (pane.offsetWidth || rect.width)
    const p = markPoint(mapHooks.map, mark, pane.offsetWidth, pane.offsetHeight)
    return p ? { x: rect.left + p[0] * scale, y: rect.top + p[1] * scale } : null
}

export function useRun(api: RunApi) {
    const apiRef = useRef(api)
    apiRef.current = api
    const [running, setRunning] = useState(false)
    const token = useRef(0)
    // The window going away (a resize to the video, TourGate.tsx) ends the run, which would otherwise drive the next one
    useEffect(() => () => { token.current++ }, [])

    const script = async (t: number) => {
        const a = () => apiRef.current
        const wait = async (ms: number) => {
            await new Promise(r => setTimeout(r, ms))
            if (token.current !== t) throw new Cancelled()
        }
        /** The control flashes as it is used */
        const press = (el: HTMLElement | null) => {
            if (!el) return
            el.classList.remove('rv-press')
            void el.offsetWidth
            el.classList.add('rv-press')
            setTimeout(() => el.classList.remove('rv-press'), 600)
        }
        const click = async (key: string) => {
            const el = q(key)
            if (!el) return
            press(el)
            await wait(250)
            el.click()
        }
        const menuOptions = () => [...document.querySelectorAll('.tnr-portal [class*="-option"]')] as HTMLElement[]
        /** Opens a select's menu: its control flashes and the menu drops down */
        const openMenu = async (menu: string, field: string) => {
            press(q(field)?.querySelector('[class*="-control"]') as HTMLElement | null)
            a().openMenu(menu)
            await wait(650)
        }
        /** The option flashes, then is chosen and the menu closes */
        const choose = async (match: (text: string) => boolean, apply: () => void) => {
            press(menuOptions().find(o => match(o.textContent ?? '')) ?? null)
            await wait(500)
            apply()
            a().openMenu(null)
        }
        /** The camera eases onto the targets (none: the whole window) and the run waits until it's there */
        const look = async (targets: AimTarget[] | null, options: AimOptions = {}) => {
            a().aim(targets, options)
            await wait(options.ms ?? 900)
        }
        // The run plays in scenes: the camera settles on an area, the controls there appear and are used, and their
        // results show in the same view where they can; it moves on when the action does. Where a control and what
        // it changes are far apart (the sidebar and the map), it pulls back to the whole window.
        /** Part of an element's box from its top-left, in its own (unzoomed) pixels: `width` × `height` */
        const region = (el: Element | null, width?: number, height?: number) => {
            if (!el) return null
            const r = el.getBoundingClientRect()
            const scale = r.width / ((el as HTMLElement).offsetWidth || r.width)
            return new DOMRect(r.left, r.top, width === undefined ? r.width : width * scale, height === undefined ? r.height : height * scale)
        }
        /** A fraction of a rect from its left */
        const leftPart = (r: DOMRect | null, fraction: number) => r && new DOMRect(r.left, r.top, r.width * fraction, r.height)
        const sidebar = () => document.querySelector('.tnr-window aside')
        /** Opens a select, picks, and the menu closes, all in the current view */
        const select = async (menuKey: string, field: string, match: (text: string) => boolean, apply: () => void, beforePick?: () => Promise<void>) => {
            await openMenu(menuKey, field)
            await beforePick?.()
            await choose(match, apply)
        }
        const pickLap = (which: 'lapA' | 'lapB', key: string) => {
            const lap = a().data()?.laps[key]?.lap
            // The label puts a non-breaking space after the number, so match the number up to a non-digit
            return select(which, which === 'lapA' ? 'analyze-lap-a-field' : 'analyze-lap-b-field',
                text => new RegExp(`Lap ${lap}(?![0-9])`).test(text), () => a().setLap(which, key))
        }
        /** Picks a lap group's car from its Driver field, by the driver's name */
        const pickDriver = (which: 'lapA' | 'lapB', key: string) => {
            const data = a().data(), driver = data?.drivers.find(d => d.index === data.laps[key]?.driver)
            if (!driver) return Promise.resolve()
            return select(`driver:${which}`, which === 'lapA' ? 'analyze-lap-a-driver-field' : 'analyze-lap-b-driver-field',
                text => text.includes(driver.name), () => a().setDriver(which, driver.index))
        }
        /** Opens the Layer menu, adds the new layer to it, and picks it; the map beside it repaints */
        const addLayer = async (value: string, name: string, first = false) => {
            if (first) a().reveal(`layer:${value}`)
            await select('layer', 'layer', text => text.trim() === name, () => a().setLayer(value),
                first ? undefined : async () => { a().reveal(`layer:${value}`); await wait(900) })
            await wait(2400)
        }
        /** Names an unlabelled icon button (by its title) in a tooltip under it (or to its left, clear of what opens
         *  under it), while the run uses it */
        const tip = (el: HTMLElement | null, ms = 1800, side: 'below' | 'left' = 'below') => {
            const host = cameraPortal(), text = el?.getAttribute('title') ?? el?.getAttribute('aria-label')
            if (!el || !host || !text) return
            const r = toCamera(el.getBoundingClientRect())
            const label = document.createElement('div')
            label.className = `tour-tip tour-tip--${side}`
            label.textContent = text
            label.style.left = `${side === 'left' ? r.left - 6 : r.left + r.width / 2}px`
            label.style.top = `${side === 'left' ? r.top + r.height / 2 : r.top + r.height + 6}px`
            label.style.animationDuration = `${ms}ms`
            host.append(label)
            setTimeout(() => label.remove(), ms)
        }
        /** A sidebar icon button appears where the camera already is, is named, then used */
        const appearAndClick = async (reveal: string, key: string, before = 700) => {
            a().reveal(reveal)
            await wait(before)
            tip(q(key))
            await wait(400)
            await click(key)
        }
        const target = () => mapHooks.pane?.firstElementChild ?? null
        const markRect = (index: number) => {
            const at = markScreenPoint(index)
            return at ? new DOMRect(at.x - 40, at.y - 40, 80, 80) : null
        }
        /** A ring pulses out where the run taps, so a hover reads as a click */
        const tap = (x: number, y: number) => {
            const host = cameraPortal()
            if (!host) return
            const at = toCamera({ left: x, top: y, width: 0, height: 0 })
            const ring = document.createElement('div')
            ring.className = 'tour-tap'
            ring.style.left = `${at.left}px`
            ring.style.top = `${at.top}px`
            host.append(ring)
            setTimeout(() => ring.remove(), 800)
        }
        /** Taps a mark and hovers it, then closes in on it with the card it pops up (unless `frame` is off, as in the
         *  layers' split view, where the map has a pane of its own) */
        const hover = async (index: number, ms: number, frame = true) => {
            const at = markScreenPoint(index), el = target()
            if (!at || !el) return
            tap(at.x, at.y)
            await wait(150)
            el.dispatchEvent(new MouseEvent('mousemove', { clientX: at.x, clientY: at.y, bubbles: true }))
            await wait(250)
            if (frame) await look([markRect(index), q('map-tooltip')], { pad: 1.15, max: 2, ms: 800 })
            await wait(ms)
            el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
        }
        const panel = (id: string) => chartHooks.panelRect?.(id) ?? null

        // The empty window fades in
        await wait(1500)

        // The title bar: the load button appears and opens São Paulo, and the bar names the file
        await look([leftPart(region(document.querySelector('.tnr-window header')), 0.45)], { pad: 1.15 })
        a().reveal('open-file')
        await wait(800)
        press(q('open-file'))
        await wait(450)
        await a().load('interlagos')
        a().reveal('session')
        await wait(1300)
        // São Paulo: the player's Lap 58 against Fernando Alonso's fastest lap
        const { lapA, lapB } = a().data()?.tour ?? { lapA: '', lapB: '' }

        // The sidebar: Lap A / Lap B mode, then both laps from their menus, Lap B's car picked from its Driver field first
        await look([region(sidebar(), 370, 640)], { pad: 1.1, ms: 1000 })
        await appearAndClick('comparison', 'comparison-toggle')
        await wait(500)
        a().reveal('lapA')
        await wait(900)
        await pickLap('lapA', lapA)
        await wait(900)
        a().reveal('lapB')
        await wait(900)
        await pickDriver('lapB', lapB)
        await wait(700)
        await pickLap('lapB', lapB)
        await wait(1000)

        // RPM joins the graphs from the metric picker at the top of the sidebar, in the same view
        a().reveal('metrics')
        await wait(700)
        tip(q('metrics-button'), 1800, 'left')
        await wait(400)
        press(q('metrics-button'))
        a().openMenu('metrics')
        await wait(900)
        press(q('metric-rpm'))
        await wait(500)
        a().addMetric('rpm')
        await wait(700)
        a().openMenu(null)
        await wait(300)

        // The metric cards and the new RPM graph together: RPM's card is recoloured in its colour picker
        a().reveal('series')
        await wait(100)
        await look([q('series'), leftPart(panel('rpm'), 0.45)], { pad: 1.1, ms: 1000 })
        await wait(500)
        press(q('series-rpm')?.querySelector('button[aria-haspopup="dialog"]') as HTMLElement | null)
        await wait(250)
        a().openMenu('color:rpm')
        await wait(800)
        // The colour glides to periwinkle, so the picker's handle and hue slider travel there, and the graph with them
        const from = a().metricColor('rpm') ?? RUN_RPM_COLOR
        const steps = 18
        for (let i = 1; i <= steps; i++) {
            a().setMetricColor('rpm', mixHex(from, RUN_RPM_COLOR, i / steps))
            await wait(40)
        }
        await wait(1000)
        a().openMenu(null)
        await wait(500)

        // The map: the sidebar's controls and the map they paint are far apart, so the whole window, where the
        // delta's sector readout appears over the graphs
        await look(null, { ms: 1000 })
        a().reveal('readout')
        await wait(1200)
        await appearAndClick('split', 'split-button')
        await wait(1500)
        // The layers in a split view: the sidebar slides down into a pane on the left, the map in from the right into
        // one beside it; the Layer field fades in on the sidebar, and each layer is picked on one and painted on the other
        await a().layerSplit(true)
        await wait(300)
        a().reveal('layer')
        await wait(900)
        await addLayer('dominance', 'Track Dominance', true)
        await addLayer('racing', 'Racing Line')
        await addLayer('inputs', 'Driver Inputs')
        await addLayer('speed', 'Speed')
        await hover(mapHooks.apexStart, 2200, false)
        await wait(400)
        await addLayer('ers', 'ERS Usage')
        await addLayer('harvest', 'ERS Harvest')
        // Back to a plain track, and the panes go back into the window
        await addLayer('none', 'None')
        await a().layerSplit(false)

        // The sidebar's view buttons and toggles, where Map and Braking Points appear and are switched on
        await look([q('views'), q('toggles')], { pad: 1.4, ms: 1000 })
        await appearAndClick('map', 'map-button')
        await wait(900)
        await appearAndClick('braking', 'braking-toggle')
        await wait(900)

        // Over to the full-width map with its braking zones; the first zone's braking half, then its acceleration
        // half, are tapped up close
        await look([q('maps')], { pad: 1.05, ms: 1100 })
        await wait(1200)
        await hover(0, 2800)
        await hover(1, 2800)

        // Back over to the toggles, where the Data Comparison Panel's appears and is switched on; then the whole
        // window, as the panel is moved onto the middle of the map
        await look([q('toggles')], { pad: 1.6, ms: 1000 })
        await appearAndClick('panel', 'panel-toggle')
        await wait(500)
        await look(null, { ms: 1000 })
        press(q('data-panel')?.querySelector('.analyze-input-comparison__drag-handle') as HTMLElement | null)
        await wait(250)
        mapHooks.movePanel?.({ x: 0.21, y: 0.5 })
        await wait(1300)

        // Both laps run, the panel's readings with them, in the whole window
        await click('map-play')
        await wait(4000)

        // Everything else
        a().reveal('rest')
        await wait(200)
    }

    const start = useCallback(() => {
        const t = ++token.current
        if (reducedMotion()) { apiRef.current.finish(); return }
        setRunning(true)
        script(t)
            .catch(error => { if (!(error instanceof Cancelled)) console.error(error) })
            .finally(async () => {
                if (token.current !== t) return
                await apiRef.current.finish()
                setRunning(false)
            })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    /** Straight to the finished playground */
    const skip = useCallback(() => {
        if (!running) return
        token.current++
        ;(document.activeElement as HTMLElement | null)?.blur()
        mapHooks.pane?.firstElementChild?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
        setRunning(false)
        apiRef.current.finish()
    }, [running])

    return { running, start, skip }
}
