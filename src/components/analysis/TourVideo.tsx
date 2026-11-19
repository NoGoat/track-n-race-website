// The tour recording's player (TourGate.tsx), for phones and small windows: the video with its own controls drawn over
// it. A thin seek bar runs across the bottom over a soft fade, play/pause and the time on the left, speed and fullscreen
// on the right. While it plays the controls fade out after a moment and come back on a tap, a mouse move or keyboard
// focus; paused, they stay. Without JavaScript the page's <noscript> copy keeps the browser's own controls.
//
// The seek bar takes pointer drags itself (an <input type="range"> can only be dragged by its thumb in iOS Safari), and
// keeps a hidden range input for the keyboard and screen readers. Seeking needs byte ranges, which worker/index.js
// serves for the recording.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { Maximize, Minimize, Pause, Play } from 'lucide-react'
import { reducedMotion } from './lib'
import { TOUR_VIDEO } from './video'

const SPEEDS = [1, 1.5, 2]
// How long the controls stay after the last tap or mouse move while the video plays
const HIDE_AFTER = 2500
const SKIP = 5

const fmt = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds || 0))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

type FullscreenVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void }

export default function TourVideo() {
    const videoRef = useRef<FullscreenVideo>(null)
    const playerRef = useRef<HTMLDivElement>(null)
    const seekRef = useRef<HTMLDivElement>(null)
    // Someone who asked for less motion starts it themselves
    const [still] = useState(reducedMotion)
    const [playing, setPlaying] = useState(false)
    const [time, setTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [buffered, setBuffered] = useState(0)
    const [speed, setSpeed] = useState(1)
    const [full, setFull] = useState(false)
    // The controls showing; `pokes` restarts the hide timer
    const [shown, setShown] = useState(true)
    const [pokes, setPokes] = useState(0)
    // The time a drag on the seek bar is at, and the spot (0–1) a mouse hovers over it
    const [scrub, setScrub] = useState<number | null>(null)
    const [hover, setHover] = useState<number | null>(null)

    const poke = () => { setShown(true); setPokes(n => n + 1) }

    // Hide the controls a moment after the last poke, while playing and not being dragged
    useEffect(() => {
        if (!shown || !playing || scrub !== null) return
        const timer = window.setTimeout(() => setShown(false), HIDE_AFTER)
        return () => window.clearTimeout(timer)
    }, [shown, playing, scrub, pokes])

    // The played part follows the video every frame while it plays (timeupdate alone comes ~4 times a second)
    useEffect(() => {
        if (!playing) return
        let frame = 0
        const tick = () => { const video = videoRef.current; if (video) setTime(video.currentTime); frame = requestAnimationFrame(tick) }
        frame = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(frame)
    }, [playing])

    useEffect(() => {
        const onChange = () => setFull(document.fullscreenElement === playerRef.current)
        document.addEventListener('fullscreenchange', onChange)
        return () => document.removeEventListener('fullscreenchange', onChange)
    }, [])

    const togglePlay = () => {
        const video = videoRef.current
        if (!video) return
        if (video.paused) video.play().catch(() => {})
        else video.pause()
        poke()
    }

    const seekTo = (t: number, exact = true) => {
        const video = videoRef.current
        if (!video || !duration) return
        const target = Math.min(Math.max(t, 0), duration)
        // Mid-drag, the nearest keyframe is enough where the browser offers it; the release lands exactly
        if (!exact && video.fastSeek) video.fastSeek(target)
        else video.currentTime = target
        setTime(target)
    }

    const cycleSpeed = () => {
        const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
        if (videoRef.current) videoRef.current.playbackRate = next
        setSpeed(next)
        poke()
    }

    const toggleFull = () => {
        const player = playerRef.current, video = videoRef.current
        if (!player || !video) return
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        else if (player.requestFullscreen) player.requestFullscreen().catch(() => {})
        // iPhone Safari only puts the video itself in fullscreen, with Apple's own controls
        else video.webkitEnterFullscreen?.()
        poke()
    }

    const updateBuffered = () => {
        const video = videoRef.current
        if (!video || !video.duration) return
        const ranges = video.buffered
        for (let i = 0; i < ranges.length; i++) {
            if (ranges.start(i) <= video.currentTime && video.currentTime <= ranges.end(i)) {
                setBuffered(ranges.end(i) / video.duration)
                return
            }
        }
    }

    // The seek bar's spot (0–1) under a pointer
    const spotAt = (event: PointerEvent) => {
        const rect = seekRef.current!.getBoundingClientRect()
        return Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
    }
    const onSeekDown = (event: PointerEvent<HTMLDivElement>) => {
        if (!duration || event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        const t = spotAt(event) * duration
        setScrub(t)
        seekTo(t, false)
    }
    const onSeekMove = (event: PointerEvent<HTMLDivElement>) => {
        if (scrub !== null) {
            const t = spotAt(event) * duration
            setScrub(t)
            seekTo(t, false)
        } else if (event.pointerType === 'mouse') setHover(spotAt(event))
    }
    const onSeekUp = () => {
        if (scrub === null) return
        seekTo(scrub)
        setScrub(null)
        poke()
    }

    // A click on the video plays or pauses it; a tap shows or hides the controls, as phones expect
    const onSurfaceUp = (event: PointerEvent<HTMLDivElement>) => {
        if (event.pointerType === 'mouse') togglePlay()
        else if (shown && playing) setShown(false)
        else poke()
    }

    // Keys while the player itself has focus (Tab reaches it); its buttons and range keep their own keys
    const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) { poke(); return }
        const actions: Record<string, () => void> = {
            ' ': togglePlay, k: togglePlay, f: toggleFull,
            ArrowLeft: () => { seekTo(time - SKIP); poke() }, ArrowRight: () => { seekTo(time + SKIP); poke() },
        }
        const action = actions[event.key]
        if (!action) return
        event.preventDefault()
        action()
    }

    const shownTime = scrub ?? time
    const played = duration ? shownTime / duration : 0
    const tip = scrub !== null ? played : hover
    const vars = { '--played': played, '--buffered': Math.max(buffered, played), '--tip': tip ?? 0 } as CSSProperties

    return <div ref={playerRef} className="tour-player" tabIndex={0} role="group" aria-label="Recording of the Analysis tour"
        data-hidden={shown ? undefined : ''} data-scrubbing={scrub !== null ? '' : undefined}
        onPointerMove={event => { if (event.pointerType === 'mouse') poke() }}
        onPointerLeave={event => { if (event.pointerType === 'mouse' && playing && scrub === null) setShown(false) }}
        onKeyDown={onKey}>
        <video ref={videoRef} className="tour-video" poster={TOUR_VIDEO.poster} width={TOUR_VIDEO.width} height={TOUR_VIDEO.height}
            autoPlay={!still} muted loop playsInline aria-label={TOUR_VIDEO.label}
            onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setShown(true) }}
            onTimeUpdate={event => { if (scrub === null) setTime(event.currentTarget.currentTime) }}
            onLoadedMetadata={event => setDuration(event.currentTarget.duration)}
            onDurationChange={event => setDuration(event.currentTarget.duration)}
            onProgress={updateBuffered} onSeeked={updateBuffered}>
            {TOUR_VIDEO.sources.map(source => <source key={source.src} {...source} />)}
        </video>
        <div className="tour-player__surface" onPointerUp={onSurfaceUp} onDoubleClick={toggleFull} />
        <div className="tour-player__ui" style={vars}>
            <div ref={seekRef} className="tour-player__seek" onPointerDown={onSeekDown} onPointerMove={onSeekMove}
                onPointerUp={onSeekUp} onPointerCancel={onSeekUp} onPointerLeave={() => setHover(null)}>
                <div className="tour-player__track">
                    <div className="tour-player__buffered" />
                    <div className="tour-player__played" />
                    <div className="tour-player__thumb" />
                </div>
                {tip !== null && <div className="tour-player__tip" aria-hidden="true">{fmt(tip * duration)}</div>}
                <input type="range" className="tour-player__range" min={0} max={duration || 0} step={1} value={shownTime}
                    aria-label="Seek" aria-valuetext={`${fmt(shownTime)} of ${fmt(duration)}`}
                    onChange={event => { seekTo(Number(event.target.value)); poke() }} />
            </div>
            <div className="tour-player__bar">
                <button type="button" className="tour-player__btn" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
                    {playing ? <Pause size={18} fill="currentColor" strokeWidth={0} /> : <Play size={18} fill="currentColor" strokeWidth={0} />}
                </button>
                <span className="tour-player__time">{fmt(shownTime)} <span>/ {fmt(duration)}</span></span>
                <span className="tour-player__spacer" />
                <button type="button" className="tour-player__btn tour-player__speed" onClick={cycleSpeed} aria-label={`Playback speed, ${speed}x`}>{speed}x</button>
                <button type="button" className="tour-player__btn" onClick={toggleFull} aria-label={full ? 'Exit full screen' : 'Full screen'}>
                    {full ? <Minimize size={17} /> : <Maximize size={17} />}
                </button>
            </div>
        </div>
    </div>
}
