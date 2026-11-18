// Gallery: the Electron / Qt / Android switch is a radio group that styles/gallery.css follows, so it works without
// this script. This keeps the pick in the URL (#qt, #android) so a link can open the gallery on it, and runs the
// viewer: one screen at a time, stepped with the Previous / Next buttons, the arrow keys or the strip of every screen.
// Without it every screen is listed in turn (styles/gallery.css).
const gallery = document.querySelector('.gallery-section');
if (gallery) {
    const androidRadio = document.getElementById('ui-android');
    const shots = Array.from(gallery.querySelectorAll('.shot'));
    const thumbs = Array.from(gallery.querySelectorAll('.strip-thumb'));
    const stage = document.getElementById('viewerStage');
    const strip = gallery.querySelector('.viewer-strip');
    const status = document.getElementById('viewerStatus');
    const lightbox = document.getElementById('lightbox');
    const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    let current = shots.find(shot => shot.classList.contains('is-current')) || shots[0];

    // The screens the picked frontend has: the Android app leaves some out
    const available = () => androidRadio?.checked ? shots.filter(shot => !shot.classList.contains('no-android')) : shots;

    const show = (shot, { announce = true } = {}) => {
        current = shot;
        shots.forEach(other => other.classList.toggle('is-current', other === shot));
        thumbs.forEach(thumb => {
            const isActive = thumb.dataset.file === shot.dataset.file;
            thumb.classList.toggle('active', isActive);
            if (isActive) thumb.setAttribute('aria-current', 'true');
            else thumb.removeAttribute('aria-current');
        });

        // Keep its thumbnail in view when the strip scrolls sideways (phones)
        const thumb = thumbs.find(t => t.classList.contains('active'));
        if (strip && thumb && strip.scrollWidth > strip.clientWidth) {
            const stripRect = strip.getBoundingClientRect();
            const thumbRect = thumb.getBoundingClientRect();
            strip.scrollBy({ left: thumbRect.left - stripRect.left - (stripRect.width - thumbRect.width) / 2, behavior: scrollBehavior });
        }

        // Tell screen readers which screen is up: "3 of 16, Data Tables" (the Android tab's own name and count)
        if (announce && status) {
            const list = available();
            const name = Array.from(shot.querySelectorAll('.module-title')).find(el => el.getClientRects().length > 0);
            status.textContent = `${list.indexOf(shot) + 1} of ${list.length}, ${name?.textContent ?? ''}`;
        }
    };

    const step = (by) => {
        const list = available();
        const index = list.indexOf(current);
        show(list[(index + by + list.length) % list.length]);
    };

    // Previous / Next, then focus the same button on the new screen so the keyboard stays put
    gallery.addEventListener('click', (e) => {
        const button = e.target.closest('.shot-step');
        if (!button) return;
        step(Number(button.dataset.step));
        current.querySelector(`.shot-step[data-step="${button.dataset.step}"]`)?.focus();
    });

    // The strip shows its screen in place of following the link (what it does without this script), and brings the
    // viewer back into view when it has scrolled away
    thumbs.forEach(thumb => {
        thumb.addEventListener('click', (e) => {
            e.preventDefault();
            const shot = shots.find(s => s.dataset.file === thumb.dataset.file);
            if (!shot) return;
            show(shot);
            const stickAt = parseFloat(getComputedStyle(stage).scrollMarginTop) || 0;
            if (stage.getBoundingClientRect().top < stickAt) stage.scrollIntoView({ behavior: scrollBehavior });
        });
    });

    // Arrow keys step, unless they're doing something else: the frontend switch, a field, or the lightbox
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
        if (lightbox?.open || e.target.closest('input, textarea, select, [contenteditable]')) return;
        step(e.key === 'ArrowRight' ? 1 : -1);
    });

    gallery.addEventListener('change', (e) => {
        if (e.target.name !== 'ui') return;
        const ui = e.target.value;
        history.replaceState(null, '', ui === 'electron' ? location.pathname + location.search : `#${ui}`);
        // On Android, a screen the app doesn't have gives way to the next one it does
        if (!available().includes(current)) {
            const list = available();
            show(list.find(shot => shots.indexOf(shot) > shots.indexOf(current)) || list[0], { announce: false });
        }
    });

    if (location.hash === '#qt' || location.hash === '#android') {
        document.getElementById(`ui-${location.hash.slice(1)}`).checked = true;
    }
}
