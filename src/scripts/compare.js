// Smooth scrolling, unless reduced motion is asked for (CSS's own setting doesn't reach scrollTo / scrollBy)
const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

// Module switchers (Compare Frontends): one tab per module, one visible
// screenshot. Each .modules block switches independently.
document.querySelectorAll('.modules').forEach(modules => {
    const moduleTabs = Array.from(modules.querySelectorAll('.module-tab'));
    const modulePanes = Array.from(modules.querySelectorAll('.module-pane'));
    if (moduleTabs.length === 0 || moduleTabs.length !== modulePanes.length) return;
    const moduleList = moduleTabs[0].parentElement;

    const selectModule = (index, focus = false) => {
        moduleTabs.forEach((tab, i) => {
            const isActive = i === index;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            tab.tabIndex = isActive ? 0 : -1;
            modulePanes[i].classList.toggle('active', isActive);
            if (isActive) {
                modulePanes[i].removeAttribute('aria-hidden');
            } else {
                modulePanes[i].setAttribute('aria-hidden', 'true');
            }
        });

        const tab = moduleTabs[index];
        if (focus) tab.focus({ preventScroll: true });

        // On phones the list is a horizontal strip: keep the active tab centred in it
        if (moduleList.scrollWidth > moduleList.clientWidth) {
            moduleList.scrollTo({
                left: tab.offsetLeft - (moduleList.clientWidth - tab.offsetWidth) / 2,
                behavior: scrollBehavior
            });
        }
    };

    moduleTabs.forEach((tab, i) => {
        tab.addEventListener('click', () => selectModule(i));

        tab.addEventListener('keydown', (e) => {
            const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
            let target = null;
            if (step) target = (i + step + moduleTabs.length) % moduleTabs.length;
            else if (e.key === 'Home') target = 0;
            else if (e.key === 'End') target = moduleTabs.length - 1;
            if (target === null) return;
            e.preventDefault();
            selectModule(target, true);
        });
    });
});

// Compare Frontends sliders: the range input's value drives the clip position
document.querySelectorAll('.compare').forEach(compare => {
    const range = compare.querySelector('.compare-range');
    if (!range) return;
    const update = () => compare.style.setProperty('--pos', `${range.value}%`);
    range.addEventListener('input', update);
    update();
});
