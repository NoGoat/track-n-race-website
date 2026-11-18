// Frontends page (/frontends/): the memory Chart / Table switch, the screen viewer and the section nav.
// Without this script the page still reads in full (styles/compare.css): chart and table both show, and every
// screen is listed with Electron and Native side by side.

const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

// Memory: Chart or Table
const memButtons = Array.from(document.querySelectorAll('[data-mem-view]'));
const memViews = Array.from(document.querySelectorAll('[data-mem]'));
const showMem = view => {
    memButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.memView === view)));
    memViews.forEach(el => { el.hidden = el.dataset.mem !== view; });
};
memButtons.forEach(b => b.addEventListener('click', () => showMem(b.dataset.memView)));
if (memButtons.length) showMem('chart');

// Screen viewer
const viewer = document.querySelector('.cmp-viewer');
if (viewer) {
    const tabs = Array.from(viewer.querySelectorAll('.cmp-tab'));
    const panes = Array.from(viewer.querySelectorAll('.cmp-pane'));
    const rail = viewer.querySelector('.cmp-rail');
    const state = { index: 0, a: 'electron', b: 'qt', mode: 'slide' };

    // The two picked frontends on every pane, the view mode, and which caption shows
    const paint = () => {
        panes.forEach(pane => {
            const hasAndroid = pane.dataset.android === 'yes';
            const has = ui => ui !== 'android' || hasAndroid;
            // A screen Android lacks can't be wiped against, so it shows side by side
            const slide = state.mode === 'slide' && has(state.a) && has(state.b);
            const view = pane.querySelector('.cmp-view');
            view.classList.toggle('is-slide', slide);
            view.classList.toggle('is-side', !slide);
            pane.querySelectorAll('.cmp-layer').forEach(layer => {
                layer.classList.toggle('is-a', layer.dataset.ui === state.a);
                layer.classList.toggle('is-b', layer.dataset.ui === state.b);
            });
            pane.querySelector('.cmp-note').hidden = !(state.mode === 'slide' && !slide);
            const androidDesc = pane.querySelector('[data-desc="android"]');
            const showAndroid = androidDesc && (state.a === 'android' || (state.b === 'android' && !has(state.a)));
            if (androidDesc) androidDesc.hidden = !showAndroid;
            pane.querySelector('[data-desc="desktop"]').hidden = !!showAndroid;
        });
        viewer.querySelectorAll('.cmp-vt').forEach(t => {
            const mine = t.dataset.side === 'a' ? state.a : state.b;
            const other = t.dataset.side === 'a' ? state.b : state.a;
            t.setAttribute('aria-pressed', String(t.dataset.val === mine));
            t.classList.toggle('is-taken', t.dataset.val === other);
            t.title = t.dataset.val === other ? 'On the other side. Click to swap.' : '';
        });
        viewer.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
    };

    const select = (index, focus = false) => {
        state.index = index;
        tabs.forEach((tab, i) => {
            const on = i === index;
            tab.classList.toggle('active', on);
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
            panes[i].classList.toggle('active', on);
            panes[i].toggleAttribute('hidden', !on);
        });
        const tab = tabs[index];
        if (focus) tab.focus({ preventScroll: true });
        // On phones the list is a horizontal strip: keep the active tab centred in it
        if (rail.scrollWidth > rail.clientWidth) {
            rail.scrollTo({ left: tab.offsetLeft - (rail.clientWidth - tab.offsetWidth) / 2, behavior: scrollBehavior });
        }
    };

    tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => select(i));
        tab.addEventListener('keydown', e => {
            const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
            let target = null;
            if (step) target = (i + step + tabs.length) % tabs.length;
            else if (e.key === 'Home') target = 0;
            else if (e.key === 'End') target = tabs.length - 1;
            if (target === null) return;
            e.preventDefault();
            select(target, true);
        });
    });

    viewer.addEventListener('click', e => {
        if (e.target.closest('[data-swap]')) {
            [state.a, state.b] = [state.b, state.a];
            paint();
            return;
        }
        const mode = e.target.closest('[data-mode]');
        if (mode) { state.mode = mode.dataset.mode; paint(); return; }
        // Picking the frontend already on the other side swaps the two, so the sides never match
        const t = e.target.closest('.cmp-vt');
        if (t) {
            const v = t.dataset.val;
            if (t.dataset.side === 'a') { if (v === state.b) state.b = state.a; state.a = v; }
            else { if (v === state.a) state.a = state.b; state.b = v; }
            paint();
        }
    });

    // Sliders: the range's value drives the clip position. One position for every screen.
    viewer.addEventListener('input', e => {
        if (!e.target.matches('.cmp-range')) return;
        const v = e.target.value;
        viewer.querySelectorAll('.cmp-view').forEach(view => view.style.setProperty('--pos', `${v}%`));
        viewer.querySelectorAll('.cmp-range').forEach(r => { if (r !== e.target) r.value = v; });
    });

    select(0);
    paint();
}

// Fold-outs (the questions and "How this was measured"): the content slides open and shut. A closing <details>
// hides its content at once, so `open` comes off only after it has folded away. Clicking again mid-way reverses
// from where it is. With reduced motion asked for, the browser's own instant open and close is left alone.
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('details:has(> .cmp-fold-body)').forEach(details => {
        const summary = details.querySelector('summary');
        const answer = details.querySelector(':scope > .cmp-fold-body');
        let anim = null;
        let closing = false;

        const run = (from, to, done) => {
            anim?.cancel();
            anim = answer.animate(
                [{ height: `${from}px`, opacity: from ? 1 : 0 }, { height: `${to}px`, opacity: to ? 1 : 0 }],
                { duration: 280, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
            );
            anim.onfinish = () => { anim = null; done?.(); };
        };

        summary.addEventListener('click', e => {
            e.preventDefault();
            // A closed <details> still reports its content's last laid-out height, so from closed it starts at 0
            const now = details.open ? answer.getBoundingClientRect().height : 0;
            if (!details.open || closing) {
                // Open, or reverse a close that's under way
                closing = false;
                details.classList.remove('is-closing');
                details.open = true;
                run(now, answer.scrollHeight);
            } else {
                closing = true;
                details.classList.add('is-closing');
                run(now, 0, () => { details.open = false; closing = false; details.classList.remove('is-closing'); });
            }
        });
    });
}

// Section nav: mark the section in view
const navLinks = Array.from(document.querySelectorAll('.cmp-nav a'));
if (navLinks.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        navLinks.forEach(a => a.classList.toggle('active', a.hash === `#${entry.target.id}`));
    }), { rootMargin: '-35% 0px -60% 0px' });
    navLinks.forEach(a => {
        const section = document.querySelector(a.hash);
        if (section) io.observe(section);
    });
}
