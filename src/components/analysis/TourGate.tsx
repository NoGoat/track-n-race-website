// The Analysis page's island (pages/analysis.astro): the interactive demo (App.tsx) where there's room for it, otherwise
// the recording of it and a note saying why. A window resized across the line swaps between them; a phone or tablet
// always gets the recording. The demo's code only downloads when it's going to run.
import { Suspense, lazy, useSyncExternalStore } from 'react'
import TourPlayer from './TourVideo'

const App = lazy(() => import('./App'))

// The demo's window is laid out 1180px wide at its smallest and scaled down to fit below that (App.tsx); under this its
// text gets too small to read
const TOO_NARROW = '(max-width: 1023.98px)'

function isMobileDevice() {
    const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } }
    if (nav.userAgentData?.mobile) return true
    // iPadOS Safari reports itself as a Mac; only the touch points give it away
    return /Android|iPhone|iPad|iPod|Mobi/i.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1)
}

const subscribeNarrow = (notify: () => void) => {
    const query = matchMedia(TOO_NARROW)
    query.addEventListener('change', notify)
    return () => query.removeEventListener('change', notify)
}
const isNarrow = () => matchMedia(TOO_NARROW).matches

function TourVideo({ note }: { note: string }) {
    return <>
        <TourPlayer />
        <p className="tour-video-note">{note}</p>
    </>
}

export default function TourGate() {
    const narrow = useSyncExternalStore(subscribeNarrow, isNarrow)
    if (isMobileDevice()) return <TourVideo note="Switch to a desktop for the interactive demo." />
    if (narrow) return <TourVideo note="Switch to a higher resolution display to watch the interactive demo." />
    return <Suspense fallback={null}><App /></Suspense>
}
