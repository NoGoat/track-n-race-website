import { detectOS, fillBuildLinks } from './platform.js';
import { markDownloadStarted } from './download-next.js';

// Download page (pages/download.astro): pick a platform, then a short guide to its builds with their download
// links.
const flow = document.getElementById('downloadFlow');
const nextBlock = document.querySelector('.dl-next');

// Smooth scrolling, unless reduced motion is asked for
const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

if (flow) {
    fillBuildLinks(flow);
    const dives = flow.querySelectorAll('.dl-dive');

    // Shows the guide for that platform; CSS shows only its download links and file types (data-os-only).
    // Focus stays on the option, so the arrow keys still move between platforms.
    const choose = (os, scroll) => {
        flow.dataset.os = os;
        let shown = null;
        dives.forEach(dive => {
            const match = dive.dataset.for.split(' ').includes(os);
            dive.hidden = !match;
            if (match) shown = dive;
        });
        if (scroll) shown?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior });
    };

    flow.addEventListener('change', (e) => {
        if (e.target.name === 'platform') choose(e.target.value, true);
    });

    // The link's own default action starts the download; this only changes what the page shows
    flow.querySelectorAll('.dl-dive a.download-build-get[data-build]').forEach(link => {
        link.addEventListener('click', () => {
            if (nextBlock) markDownloadStarted(nextBlock, link);
        });
    });

    // Start on this device's platform, unless going back to the page brought the last choice back.
    // No scroll: the guide just appears under the options. A platform detectOS doesn't know starts with none.
    let checked = flow.querySelector('input[name="platform"]:checked');
    if (!checked) {
        checked = flow.querySelector(`input[name="platform"][value="${detectOS()}"]`);
        if (checked) checked.checked = true;
    }
    if (checked) choose(checked.value, false);
}
