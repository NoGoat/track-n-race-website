// The recording of the Analysis tour, played without JavaScript (pages/analysis.astro) and in place of the interactive
// demo on phones and small windows (TourGate.tsx). It is recorded at 1920×1080 (tools/record-analysis-video.mjs) and
// served as VP9 WebM only: the 360p and 720p files for screens they are sharp enough on (each media query asks for the
// screen width × pixel density it covers; the first that matches wins), the 1080p file everywhere else.
// The files are served with hashed names, so a new recording reaches returning visitors on its first load. A video not
// in the folder yet is left out of the sources rather than failing the build.
const WEBM = 'video/webm; codecs="vp9"'
const FILES = import.meta.glob('/src/assets/analysis-tour/*.{jpg,webm}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const file = (name: string): string | undefined => FILES[`/src/assets/analysis-tour/${name}`]
type Source = { src: string | undefined, type: string, media?: string }

export const TOUR_VIDEO = {
    poster: file('analysis-tour-1080p-poster.jpg'),
    width: 1920,
    height: 1080,
    label: "A recording of the Analysis screen of Track N Race 1.7.0 building itself: São Paulo's laps 58 and 71 compared in graphs, RPM added and recoloured, then the map with its layers, braking points and data panel",
    sources: ([
        { src: file('analysis-tour-360p.webm'), type: WEBM, media: '(max-width: 640px) and (max-resolution: 1dppx), (max-width: 320px) and (max-resolution: 2dppx), (max-width: 213px)' },
        { src: file('analysis-tour-720p.webm'), type: WEBM, media: '(max-width: 1280px) and (max-resolution: 1dppx), (max-width: 640px) and (max-resolution: 2dppx), (max-width: 426px)' },
        { src: file('analysis-tour-1080p.webm'), type: WEBM },
    ] as Source[]).filter((source): source is Source & { src: string } => source.src !== undefined),
}
