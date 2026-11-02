// The app's colour picker (electron-frontend components/ColorPicker.tsx), ported as written: a swatch that opens
// @uiw's Chrome picker in a portal, hex only, with the select menus' wipe. `forceOpen` lets the run hold it open.
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Chrome, { ChromeInputType } from '@uiw/react-color-chrome'
import { ArrowDownUp } from 'lucide-react'
import { portalTarget, SELECT_MENU_ANIMATION_MS } from './select'
import { reducedMotion } from './lib'
import { toCamera } from './camera'

type Phase = 'closed' | 'open' | 'closing'

const chromeStyle = {
    '--github-background-color': 'var(--bg-menu)',
    '--github-border': '1px solid var(--border)',
    '--github-box-shadow': '0 8px 32px rgba(0,0,0,0.6)',
    '--github-arrow-border-color': 'var(--border)',
    '--editable-input-label-color': 'var(--text-secondary)',
    '--editable-input-box-shadow': 'var(--border) 0 0 0 1px inset',
    '--editable-input-color': 'var(--text-primary)',
    '--chrome-arrow-fill': 'var(--text-secondary)',
    '--chrome-arrow-background-color': 'var(--bg-hover)',
    width: 230,
    borderRadius: 6,
    fontFamily: '"Cascadia Code", ui-monospace, monospace',
} as CSSProperties

export default memo(function ColorPicker({ label, color, onChange, triggerClassName, triggerStyle, disabled = false, forceOpen = false, children }: {
    label: string
    color: string
    onChange: (color: string) => void
    triggerClassName?: string
    triggerStyle?: CSSProperties
    disabled?: boolean
    /** Holds the picker open (the run opens it itself) */
    forceOpen?: boolean
    /** Content for a trigger that is not a plain swatch */
    children?: ReactNode
}) {
    const [phase, setPhase] = useState<Phase>('closed')
    const [position, setPosition] = useState({ left: 8, top: 8, above: false })
    const [formatIconHost, setFormatIconHost] = useState<HTMLElement | null>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)
    const pickerRef = useRef<HTMLDivElement>(null)
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const open = phase === 'open'
    const mounted = phase !== 'closed' && !disabled

    const cancelClose = useCallback(() => {
        if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
    }, [])
    const openPicker = useCallback(() => { cancelClose(); setPhase('open') }, [cancelClose])
    const closePicker = useCallback(() => {
        cancelClose()
        if (reducedMotion()) { setPhase('closed'); return }
        setPhase(current => current === 'open' ? 'closing' : current)
        closeTimerRef.current = setTimeout(() => { closeTimerRef.current = null; setPhase('closed') }, SELECT_MENU_ANIMATION_MS)
    }, [cancelClose])
    useEffect(() => cancelClose, [cancelClose])

    const forced = useRef(false)
    useEffect(() => {
        if (forceOpen) { forced.current = true; openPicker() }
        else if (forced.current) { forced.current = false; closePicker() }
    }, [closePicker, forceOpen, openPicker])

    // Disabling closes the picker outright, without its exit animation
    if (disabled && phase !== 'closed') setPhase('closed')
    useEffect(() => { if (disabled) cancelClose() }, [cancelClose, disabled])

    useLayoutEffect(() => {
        if (!open) return
        const place = () => {
            const screen = buttonRef.current?.getBoundingClientRect()
            if (!screen) return
            // Placed in the camera's coordinates; whether it fits below is a question of the screen
            const rect = toCamera(screen)
            const pickerWidth = 230, pickerHeight = 260
            const left = Math.max(8, rect.left)
            const above = screen.bottom + (6 + pickerHeight) * rect.scale > window.innerHeight
            setPosition({ left, top: above ? Math.max(8, rect.top - pickerHeight - 6) : rect.top + rect.height + 6, above })
        }
        place()
        window.addEventListener('resize', place)
        return () => window.removeEventListener('resize', place)
    }, [open])

    // Keyed on mounted rather than open so the icon stays through the exit animation
    useLayoutEffect(() => {
        if (!mounted) { setFormatIconHost(null); return }
        const nativeIcon = pickerRef.current?.querySelector<SVGElement>('svg[viewBox="0 0 1024 1024"]')
        setFormatIconHost(nativeIcon?.parentElement ?? null)
    }, [mounted])

    useEffect(() => {
        if (!open || forceOpen) return
        const closeOutside = (event: PointerEvent) => {
            const target = event.target as Node
            if (!buttonRef.current?.contains(target) && !pickerRef.current?.contains(target)) closePicker()
        }
        const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closePicker() }
        document.addEventListener('pointerdown', closeOutside)
        document.addEventListener('keydown', closeOnEscape)
        return () => {
            document.removeEventListener('pointerdown', closeOutside)
            document.removeEventListener('keydown', closeOnEscape)
        }
    }, [closePicker, forceOpen, open])

    return <>
        <button ref={buttonRef} type="button" disabled={disabled} draggable={false} title={label}
            aria-label={`${label} color`} aria-haspopup="dialog" aria-expanded={open}
            onClick={() => open ? closePicker() : openPicker()}
            className={triggerClassName ?? 'w-5 h-5 rounded border border-[var(--border)] cursor-pointer shrink-0 shadow-inner'}
            style={{ backgroundColor: color, ...triggerStyle }}
        >{children}</button>
        {mounted && createPortal(<div ref={pickerRef} role="dialog" aria-label={`${label} color picker`} className="fixed z-[10000]"
            style={{
                left: position.left,
                top: position.top,
                // Same wipe and fill as the select menus, so the popups share one look
                animation: reducedMotion() ? undefined : `${open
                    ? (position.above ? 'selectMenuEnterTop' : 'selectMenuEnterBottom')
                    : (position.above ? 'selectMenuExitTop' : 'selectMenuExitBottom')} ${SELECT_MENU_ANIMATION_MS}ms cubic-bezier(0.2, 0, 0, 1) both`,
                pointerEvents: open ? undefined : 'none',
                willChange: 'clip-path',
            }}>
            <Chrome className="analyze-color-picker" color={color} inputType={ChromeInputType.HEXA} showAlpha={false} showTriangle={false}
                style={chromeStyle} onChange={result => onChange(result.hex)} />
            {formatIconHost?.isConnected && createPortal(
                <span className="w-8 h-8 flex items-center justify-center pointer-events-none text-[var(--text-secondary)]">
                    <ArrowDownUp size={16} strokeWidth={1.75} className="analyze-color-format-icon" />
                </span>,
                formatIconHost,
            )}
        </div>, portalTarget())}
    </>
})
