// The run that opens the Analysis page. It builds the screen in front of the visitor: the window starts empty,
// then each control appears when it is needed and is used straight away (the real controls, so the results are
// the real results). It loads São Paulo, sets Lap A and Lap B, opens the map and adds the map layers one at a
// time, then reveals everything else and leaves a working playground. A click on the window skips to the end.
import { useCallback, useRef, useState } from 'react'
import { mapHooks } from './MapPane'
import { markPoint } from './TrackMap'
import { reducedMotion, type TourData } from './lib'

export interface RunApi {
    reveal: (...keys: string[]) => void
    revealAll: () => void
    load: (id: string) => Promise<void>
    data: () => TourData | null
    /** Holds a menu open ('lapA', 'lapB', 'layer'), or closes it with null */
    openMenu: (key: string | null) => void
    setLap: (which: 'lapA' | 'lapB', lap: number) => void
    setLayer: (layer: string) => void
    /** Puts the screen in the run's final state (laps, view, layer, toggles) and reveals everything */
    finish: () => Promise<void>
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
        const pickLap = async (which: 'lapA' | 'lapB', lap: number) => {
            await openMenu(which, which === 'lapA' ? 'analyze-lap-a-field' : 'analyze-lap-b-field')
            // The label puts a non-breaking space after the number, so match the number up to a non-digit
            await choose(text => new RegExp(`Lap ${lap}(?![0-9])`).test(text), () => a().setLap(which, lap))
        }
        /** Opens the Layer menu, adds the new layer to it, and picks it */
        const addLayer = async (value: string, name: string, first = false) => {
            if (first) a().reveal(`layer:${value}`)
            await openMenu('layer', 'layer')
            if (!first) { a().reveal(`layer:${value}`); await wait(900) }
            await choose(text => text.trim() === name, () => a().setLayer(value))
            await wait(2600)
        }
        const target = () => mapHooks.pane?.firstElementChild ?? null
        const hover = async (index: number, ms: number) => {
            const at = markScreenPoint(index), el = target()
            if (!at || !el) return
            el.dispatchEvent(new MouseEvent('mousemove', { clientX: at.x, clientY: at.y, bubbles: true }))
            await wait(ms)
            el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }))
        }

        // The empty window fades in
        await wait(1500)

        // Load: the button appears and opens São Paulo
        a().reveal('open-file')
        await wait(1000)
        press(q('open-file'))
        await wait(450)
        await a().load('interlagos')
        a().reveal('session')
        await wait(1100)
        // São Paulo: Lap 58 against Lap 71 (Lap 70 is the third lap in the lists)
        const [lapA, lapB] = a().data()?.featured ?? []

        // Lap A / Lap B mode
        a().reveal('comparison')
        await wait(900)
        await click('comparison-toggle')
        await wait(700)
        a().reveal('lapA')
        await wait(900)
        await pickLap('lapA', lapA)
        await wait(1600)
        a().reveal('lapB')
        await wait(900)
        await pickLap('lapB', lapB)
        await wait(1300)
        a().reveal('readout')
        await wait(1500)

        // The map
        a().reveal('split')
        await wait(900)
        await click('split-button')
        await wait(1800)

        // Map layers, one at a time
        a().reveal('layer')
        await wait(800)
        await addLayer('dominance', 'Track Dominance', true)
        await addLayer('inputs', 'Driver Inputs')
        await addLayer('speed', 'Speed')
        await hover(mapHooks.apexStart, 2200)
        await wait(500)
        await addLayer('ers', 'ERS Usage')
        await addLayer('harvest', 'ERS Harvest')

        // Back to a plain track on the full-width map for Braking Points and the panel
        await addLayer('none', 'None')
        a().reveal('map')
        await wait(900)
        await click('map-button')
        await wait(1600)

        // Braking Points
        a().reveal('braking')
        await wait(900)
        await click('braking-toggle')
        await wait(1600)
        await hover(0, 3200)
        await wait(300)
        await hover(1, 3200)
        await wait(500)

        // Data Comparison Panel, then both laps run
        a().reveal('panel')
        await wait(900)
        await click('panel-toggle')
        await wait(1200)
        press(q('data-panel')?.querySelector('.analyze-input-comparison__drag-handle') as HTMLElement | null)
        await wait(250)
        mapHooks.movePanel?.({ x: 0, y: 1 })
        await wait(1300)
        await click('map-play')
        await wait(4500)

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
