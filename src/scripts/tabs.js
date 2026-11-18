// Tabs inside a [data-tabscope]: buttons with data-tab show the [data-pane] of the same name and hide the others.
// The panes are only hidden here, so without JavaScript every pane shows (components/FirewallFix.astro labels each
// one for that). Used by the Setup page's checklist and the Troubleshooting page.
const select = (scope, key) => {
    scope.querySelectorAll(':scope > [role="tablist"] > [data-tab]').forEach(tab => {
        tab.setAttribute('aria-selected', String(tab.dataset.tab === key));
        tab.tabIndex = tab.dataset.tab === key ? 0 : -1;
    });
    scope.querySelectorAll(':scope > [data-pane]').forEach(pane => {
        pane.hidden = pane.dataset.pane !== key;
    });
};

document.querySelectorAll('[data-tabscope]').forEach(scope => {
    const current = scope.querySelector(':scope > [role="tablist"] > [aria-selected="true"]');
    if (current) select(scope, current.dataset.tab);
});

document.addEventListener('click', e => {
    const tab = e.target.closest('[data-tabscope] > [role="tablist"] > [data-tab]');
    if (tab) select(tab.closest('[data-tabscope]'), tab.dataset.tab);
});

// Arrow keys move between the tabs of one list
document.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tab = e.target.closest('[data-tabscope] > [role="tablist"] > [data-tab]');
    if (!tab) return;
    const tabs = Array.from(tab.parentElement.querySelectorAll(':scope > [data-tab]'));
    const next = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    select(tab.closest('[data-tabscope]'), next.dataset.tab);
    next.focus();
});
