// react-select as the app uses it: lib/selectStyles.ts, lib/AnimatedSelect.tsx and lib/selectComponents.tsx.
// Menus portal into a .tnr-portal element, which carries the app's theme tokens: the one inside the run's camera
// (camera.ts) once it is mounted, so they zoom and pan with the window.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Select, { components, type GroupBase, type Props, type StylesConfig } from 'react-select'
import { ChevronDown, X } from 'lucide-react'
import { cameraPortal, toCamera } from './camera'

export const SELECT_MENU_ANIMATION_MS = 220

let portalNode: HTMLElement | null = null
/** Where the window's pop-ups render: inside the camera, or the page's portal before it mounts */
export const portalTarget = (): HTMLElement => cameraPortal() ?? pagePortal()
/** The page's own portal, for what covers the page rather than the window (dialogs) */
export function pagePortal(): HTMLElement {
    if (!portalNode) {
        portalNode = document.createElement('div')
        portalNode.className = 'tnr-portal'
        document.body.append(portalNode)
    }
    return portalNode
}

export function buildSelectStyles({ solidBg = false, controlHeight = 28, labelStyleGroupHeadings = false, menuWidth, scrollableMenu = true }:
    { solidBg?: boolean; controlHeight?: number; labelStyleGroupHeadings?: boolean; menuWidth?: string | number; scrollableMenu?: boolean } = {}): StylesConfig<any, false, any> {
    return {
        container: base => ({ ...base, userSelect: 'none', WebkitUserSelect: 'none' }),
        control: base => ({
            ...base,
            display: 'flex',
            alignItems: 'center',
            background: solidBg ? 'var(--bg-panel)' : 'transparent',
            border: 'none',
            boxShadow: 'none',
            minHeight: controlHeight,
            height: controlHeight,
            borderRadius: 6,
            fontSize: 11,
            cursor: 'pointer',
            transition: 'background 0.15s ease',
            '&:hover': { background: 'var(--bg-hover)' },
        }),
        valueContainer: base => ({ ...base, height: controlHeight, padding: '0 8px', flexWrap: 'nowrap', display: 'flex', alignItems: 'center' }),
        indicatorsContainer: base => ({ ...base, height: controlHeight }),
        singleValue: base => ({ ...base, color: 'var(--text-primary)', fontSize: 11, margin: 0, lineHeight: 1 }),
        placeholder: base => ({ ...base, color: 'var(--text-secondary)', fontSize: 11, margin: 0, lineHeight: 1 }),
        input: base => ({ ...base, color: 'var(--text-primary)', fontSize: 11, margin: 0, padding: 0, lineHeight: 1 }),
        indicatorSeparator: () => ({ display: 'none' }),
        dropdownIndicator: (base, state) => ({
            ...base,
            padding: '0 6px',
            color: state.isFocused || state.selectProps.menuIsOpen ? 'var(--text-primary)' : 'var(--text-secondary)',
            transform: state.selectProps.menuIsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease, color 0.15s ease',
            '&:hover': { color: 'var(--text-primary)' },
        }),
        clearIndicator: base => ({ ...base, padding: '0 4px', color: 'var(--text-secondary)', '&:hover': { color: '#e10600' } }),
        menu: (base, state) => ({
            ...base,
            width: menuWidth ?? base.width,
            background: 'var(--bg-menu)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            zIndex: 9999,
            marginTop: 4,
            overflow: 'hidden',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            transformOrigin: state.placement === 'top' ? 'bottom center' : 'top center',
            animation: `${state.placement === 'top' ? 'selectMenuEnterTop' : 'selectMenuEnterBottom'} ${SELECT_MENU_ANIMATION_MS}ms cubic-bezier(0.2, 0, 0, 1) both`,
        }),
        // react-select places the portal from the control's screen rect (plus the page scroll when absolute); the
        // portal sits in the camera, so that becomes the camera's coordinates
        menuPortal: (base: any) => {
            const top = base.top - (base.position === 'absolute' ? window.scrollY : 0)
            const at = toCamera({ left: base.left, top, width: base.width, height: 0 })
            return { ...base, position: 'absolute', left: at.left, top: at.top, width: at.width, zIndex: 9999 }
        },
        menuList: base => ({ ...base, padding: 4, ...(scrollableMenu ? {} : { maxHeight: 'none', overflowY: 'visible' as const }) }),
        group: base => labelStyleGroupHeadings ? { ...base, paddingTop: 2, paddingBottom: 2 } : base,
        groupHeading: base => labelStyleGroupHeadings ? {
            ...base, color: 'var(--text-secondary)', fontSize: 9, fontWeight: 400, letterSpacing: '0.1em',
            textTransform: 'uppercase', margin: 0, padding: '2px 8px',
        } : base,
        option: (base, state) => ({
            ...base,
            background: state.isSelected ? 'var(--border-focus)' : state.isFocused && !state.isDisabled ? 'rgba(255,255,255,0.12)' : 'transparent',
            color: state.isSelected ? '#fff' : state.isDisabled ? 'var(--text-muted)' : 'var(--text-primary)',
            fontSize: 11,
            borderRadius: 4,
            padding: '5px 8px',
            cursor: state.isDisabled ? 'not-allowed' : 'pointer',
            transition: 'background 0.1s',
            '&:active': { background: state.isDisabled ? 'transparent' : 'var(--border-focus)', color: state.isDisabled ? 'var(--text-muted)' : '#fff' },
        }),
    }
}

function DropdownIndicator(props: any) {
    return <components.DropdownIndicator {...props}><ChevronDown size={12} /></components.DropdownIndicator>
}
function ClearIndicator(props: any) {
    return <components.ClearIndicator {...props}><X size={12} /></components.ClearIndicator>
}
export const selectComponents = { DropdownIndicator, ClearIndicator }
export const displayOnlySelectComponents = { DropdownIndicator: () => null, ClearIndicator: () => null }

type MenuPhase = 'closed' | 'open' | 'closing'

/** Keeps react-select's menu mounted just long enough to play its exit animation. */
export default function AnimatedSelect<Option, Group extends GroupBase<Option> = GroupBase<Option>>(props: Props<Option, false, Group> & {
    /** Holds the menu open (the run opens menus itself rather than through react-select's focus handling) */
    forceOpen?: boolean
}) {
    const { menuPlacement = 'auto', onMenuClose, onMenuOpen, styles, forceOpen = false, ...rest } = props
    const [phase, setPhase] = useState<MenuPhase>('closed')
    const openMenu = useCallback(() => { setPhase('open'); onMenuOpen?.() }, [onMenuOpen])
    const forced = useRef(false)
    useEffect(() => {
        if (forceOpen) { forced.current = true; setPhase('open') }
        else if (forced.current) { forced.current = false; setPhase(p => p === 'open' ? 'closing' : p) }
    }, [forceOpen])
    const closeMenu = useCallback(() => {
        if (phase !== 'open' || forceOpen) return
        onMenuClose?.()
        setPhase('closing')
    }, [forceOpen, onMenuClose, phase])
    useEffect(() => {
        if (phase !== 'closing') return
        const timer = setTimeout(() => setPhase('closed'), SELECT_MENU_ANIMATION_MS)
        return () => clearTimeout(timer)
    }, [phase])
    const animatedStyles = useMemo<StylesConfig<Option, false, Group>>(() => ({
        ...styles,
        menu: (base, state) => {
            const menuStyle = styles?.menu ? styles.menu(base, state) : base
            if (phase !== 'closing') return menuStyle
            return {
                ...menuStyle,
                animation: `${state.placement === 'top' ? 'selectMenuExitTop' : 'selectMenuExitBottom'} ${SELECT_MENU_ANIMATION_MS}ms cubic-bezier(0.2, 0, 0, 1) both`,
                pointerEvents: 'none',
            }
        },
    }), [phase, styles])
    const ref = useRef(null)
    return <Select<Option, false, Group>
        ref={ref}
        {...rest}
        menuShouldScrollIntoView={false}
        menuPlacement={menuPlacement}
        menuIsOpen={phase !== 'closed'}
        onMenuOpen={openMenu}
        onMenuClose={closeMenu}
        styles={animatedStyles}
        menuPortalTarget={rest.menuPortalTarget === undefined ? portalTarget() : rest.menuPortalTarget}
    />
}
