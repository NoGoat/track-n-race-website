// The Analysis page's island (pages/analysis.astro): the interactive demo (App.tsx) where there's room for it, otherwise
// the recording of it and a note saying why. A window resized across the line swaps between them; a phone or tablet
// always gets the recording. The demo's code only downloads when it's going to run.
import { Suspense, lazy, useSyncExternalStore } from 'react'
import { reducedMotion } from './lib'
import { TOUR_VIDEO } from './video'

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
    // Someone who asked for less motion starts it themselves
    const still = reducedMotion()
    return <>
        <video className="tour-video" poster={TOUR_VIDEO.poster} width={TOUR_VIDEO.width} height={TOUR_VIDEO.height}
            autoPlay={!still} controls={still} muted loop playsInline aria-label={TOUR_VIDEO.label}>
            {TOUR_VIDEO.sources.map(source => <source key={source.src} {...source} />)}
        </video>
        <p className="tour-video-note">{note}</p>
    </>
}

export default function TourGate() {
    const narrow = useSyncExternalStore(subscribeNarrow, isNarrow)
    if (isMobileDevice()) return <TourVideo note="Switch to a desktop for the interactive demo." />
    if (narrow) return <TourVideo note="Switch to a higher resolution display to watch the interactive demo." />
    return <Suspense fallback={null}><App /></Suspense>
}
