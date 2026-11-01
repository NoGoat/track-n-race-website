import { detectOS, appleMobileOS } from './platform.js';
import { markDownloadStarted } from './download-next.js';

// Download page (pages/download.astro): pick a platform, then a short guide to its builds with their download
// links. The checked platform's guide shows by CSS alone (styles/download.css); this starts on this device's platform
// and brings a newly picked guide into view.
const flow = document.getElementById('downloadFlow');
const nextBlock = document.querySelector('.dl-next');

// Smooth scrolling, unless reduced motion is asked for
const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

if (flow) {
    // Focus stays on the option, so the arrow keys still move between platforms
    flow.addEventListener('change', (e) => {
        if (e.target.name !== 'platform') return;
        flow.querySelector(`.dl-dive[data-for~="${e.target.value}"]`)
            ?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior });
    });

    // The link's own default action starts the download; this only changes what the page shows
    flow.querySelectorAll('.dl-dive a.download-build-get[data-build]').forEach(link => {
        link.addEventListener('click', () => {
            if (nextBlock) markDownloadStarted(nextBlock, link);
        });
    });

    // Start on this device's platform, unless going back to the page brought the last choice back.
    // No scroll: the guide just appears under the options.
    if (!flow.querySelector('input[name="platform"]:checked')) {
        flow.querySelector(`input[name="platform"][value="${detectOS()}"]`).checked = true;
    }

    // There's no iOS or iPadOS build: the macOS guide, where they start, says so
    const mobileOS = appleMobileOS();
    if (mobileOS) {
        flow.querySelectorAll('.dl-ios-warning').forEach(note => {
            note.querySelector('.dl-ios-name').textContent = mobileOS;
            note.hidden = false;
        });
    }
}
