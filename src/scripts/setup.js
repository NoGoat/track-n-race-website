// Setup Page tabs: the Scenario Selector (Single PC vs Dual System) and the Platform Tabs (Windows vs macOS vs Linux).
// Each tab shows the pane its aria-controls names. Arrow keys, Home and End move between a tablist's tabs and select
// them; only the selected tab is in the Tab order.
const setupTabs = (tabs) => {
    if (tabs.length === 0) return;
    const select = (tab, focus = false) => {
        tabs.forEach(other => {
            const isActive = other === tab;
            other.classList.toggle('active', isActive);
            other.setAttribute('aria-selected', isActive ? 'true' : 'false');
            other.tabIndex = isActive ? 0 : -1;
            document.getElementById(other.getAttribute('aria-controls'))?.classList.toggle('active', isActive);
        });
        if (focus) tab.focus();
    };

    tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => select(tab));
        tab.addEventListener('keydown', (e) => {
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            let target = null;
            if (step) target = (i + step + tabs.length) % tabs.length;
            else if (e.key === 'Home') target = 0;
            else if (e.key === 'End') target = tabs.length - 1;
            if (target === null) return;
            e.preventDefault();
            select(tabs[target], true);
        });
    });
};

setupTabs(Array.from(document.querySelectorAll('.scenario-selector [role="tab"]')));
setupTabs(Array.from(document.querySelectorAll('.platform-tab-btn')));

// Copy to Clipboard Action Buttons
// The result is announced through #copyStatus, a visually hidden live region
const copyButtons = document.querySelectorAll('.copy-action-btn[data-copy]');
const copyStatus = document.getElementById('copyStatus');
const announce = (message) => {
    if (!copyStatus) return;
    // Cleared first, so the same message twice in a row is still read out
    copyStatus.textContent = '';
    setTimeout(() => { copyStatus.textContent = message; }, 50);
};

// The button's label says what happened for two seconds
const flash = (btn, text) => {
    const span = btn.querySelector('.copy-label');
    if (!span) return;
    clearTimeout(btn.flashTimer);
    span.textContent = text;
    btn.classList.toggle('copied', text === 'Copied!');
    btn.flashTimer = setTimeout(() => {
        btn.classList.remove('copied');
        span.textContent = 'Copy';
    }, 2000);
};

copyButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const textToCopy = btn.getAttribute('data-copy');
        if (!textToCopy) return;

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(textToCopy);
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = textToCopy;
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                textArea.remove();
                btn.focus(); // the textarea took focus; give it back
            }

            flash(btn, 'Copied!');
            announce(`Copied ${textToCopy} to the clipboard`);
        } catch (err) {
            flash(btn, 'Failed');
            announce(`Couldn't copy ${textToCopy}`);
            console.error('Failed to copy text: ', err);
        }
    });
});
