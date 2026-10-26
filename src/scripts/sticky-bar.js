// TNRD version rail and Gallery header: they go edge to edge once they stick under the navbar
const stickyBar = document.querySelector('.fmt-rail, .gallery-head');
if (stickyBar) {
    let railFrame = 0;
    const syncRail = () => {
        railFrame = 0;
        const stickAt = parseFloat(getComputedStyle(stickyBar).top) || 0;
        stickyBar.classList.toggle('is-stuck', stickyBar.getBoundingClientRect().top <= stickAt + 0.5);
    };
    const queueRail = () => { if (!railFrame) railFrame = requestAnimationFrame(syncRail); };
    window.addEventListener('scroll', queueRail, { passive: true });
    window.addEventListener('resize', queueRail);
    syncRail();
}
