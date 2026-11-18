// The recording of the Analysis tour, played without JavaScript (pages/analysis.astro) and in place of the interactive
// demo on phones and small windows (TourGate.tsx). The 4K MP4 (src/assets/analysis-tour/analysis-tour-4k.mp4) is the
// master; the VP9 WebMs are made from it. Each WebM's media query asks for the screen width × pixel density it covers,
// so the first that matches is the smallest one sharp enough there; browsers without VP9 WebM fall back to the MP4.
// The files are served with hashed names, so a new recording reaches returning visitors on its first load. A video not
// in the folder yet is left out of the sources rather than failing the build.
const WEBM = 'video/webm; codecs="vp9"'
const FILES = import.meta.glob('/src/assets/analysis-tour/*.{jpg,webm,mp4}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const file = (name: string): string | undefined => FILES[`/src/assets/analysis-tour/${name}`]
type Source = { src: string | undefined, type: string, media?: string }

export const TOUR_VIDEO = {
    poster: file('analysis-tour-4k-poster.jpg'),
    width: 3840,
    height: 2160,
    label: "A recording of the Analysis screen of Track N Race 1.7.0 building itself: São Paulo's laps 58 and 71 compared in graphs, RPM added and recoloured, then the map with its layers, braking points and data panel",
    sources: ([
        { src: file('analysis-tour-720p.webm'), type: WEBM, media: '(max-width: 1280px) and (max-resolution: 1dppx), (max-width: 640px) and (max-resolution: 2dppx), (max-width: 426px)' },
        { src: file('analysis-tour-1080p.webm'), type: WEBM, media: '(max-width: 1920px) and (max-resolution: 1dppx), (max-width: 960px) and (max-resolution: 2dppx), (max-width: 640px)' },
        { src: file('analysis-tour-1440p.webm'), type: WEBM, media: '(max-width: 2560px) and (max-resolution: 1dppx), (max-width: 1280px) and (max-resolution: 2dppx), (max-width: 853px)' },
        { src: file('analysis-tour-2160p.webm'), type: WEBM },
        { src: file('analysis-tour-4k.mp4'), type: 'video/mp4' },
    ] as Source[]).filter((source): source is Source & { src: string } => source.src !== undefined),
}
