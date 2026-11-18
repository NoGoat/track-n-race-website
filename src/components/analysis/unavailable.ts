// Controls the demo can't show working (the settings, the export, the secondary file): clicking one asks App.tsx to
// open its "download the app" modal.
const EVENT = 'tnr-demo-unavailable'

export const showUnavailable = () => window.dispatchEvent(new Event(EVENT))

export const onUnavailable = (handler: () => void) => {
    window.addEventListener(EVENT, handler)
    return () => window.removeEventListener(EVENT, handler)
}
