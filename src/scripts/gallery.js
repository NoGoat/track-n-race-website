// Gallery: the Electron / Qt / Android switch shows every screen in the picked frontend.
// The pick is kept in the URL (#qt, #android) so a link can open the gallery on it.
const gallery = document.querySelector('.gallery-section');
if (gallery) {
    const switchBtns = Array.from(gallery.querySelectorAll('.gallery-switch-btn'));
    const pickUi = (ui, focus = false) => {
        gallery.dataset.ui = ui;
        switchBtns.forEach(btn => {
            const isActive = btn.dataset.ui === ui;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
            btn.tabIndex = isActive ? 0 : -1;
            if (isActive && focus) btn.focus();
        });
        history.replaceState(null, '', ui === 'electron' ? location.pathname + location.search : `#${ui}`);
    };

    switchBtns.forEach((btn, i) => {
        btn.addEventListener('click', () => pickUi(btn.dataset.ui));
        btn.addEventListener('keydown', (e) => {
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (!step) return;
            e.preventDefault();
            pickUi(switchBtns[(i + step + switchBtns.length) % switchBtns.length].dataset.ui, true);
        });
    });

    if (location.hash === '#qt' || location.hash === '#android') pickUi(location.hash.slice(1));
}
