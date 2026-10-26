// Setup Page Scenario Selector (Single PC vs Dual System)
const scenarioSingleBtn = document.getElementById('scenarioSingleBtn');
const scenarioDualBtn = document.getElementById('scenarioDualBtn');
const scenarioSinglePane = document.getElementById('scenarioSinglePane');
const scenarioDualPane = document.getElementById('scenarioDualPane');

if (scenarioSingleBtn && scenarioDualBtn && scenarioSinglePane && scenarioDualPane) {
    scenarioSingleBtn.addEventListener('click', () => {
        scenarioSingleBtn.classList.add('active');
        scenarioSingleBtn.setAttribute('aria-selected', 'true');
        scenarioDualBtn.classList.remove('active');
        scenarioDualBtn.setAttribute('aria-selected', 'false');
        scenarioSinglePane.classList.add('active');
        scenarioDualPane.classList.remove('active');
    });

    scenarioDualBtn.addEventListener('click', () => {
        scenarioDualBtn.classList.add('active');
        scenarioDualBtn.setAttribute('aria-selected', 'true');
        scenarioSingleBtn.classList.remove('active');
        scenarioSingleBtn.setAttribute('aria-selected', 'false');
        scenarioDualPane.classList.add('active');
        scenarioSinglePane.classList.remove('active');
    });
}

// Setup Page Platform Tabs (Windows vs macOS vs Linux)
const platformTabButtons = document.querySelectorAll('.platform-tab-btn');
const platformPanes = document.querySelectorAll('.platform-pane');

if (platformTabButtons.length > 0 && platformPanes.length > 0) {
    platformTabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetPaneId = btn.getAttribute('aria-controls');
            if (!targetPaneId) return;

            platformTabButtons.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            platformPanes.forEach(p => {
                p.classList.remove('active');
            });

            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            const targetPane = document.getElementById(targetPaneId);
            if (targetPane) targetPane.classList.add('active');
        });
    });
}

// Copy to Clipboard Action Buttons
const copyButtons = document.querySelectorAll('.copy-action-btn[data-copy]');
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
            }

            const span = btn.querySelector('span');
            const origText = span ? span.textContent : 'Copy';
            btn.classList.add('copied');
            if (span) span.textContent = 'Copied!';

            setTimeout(() => {
                btn.classList.remove('copied');
                if (span) span.textContent = origText;
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    });
});
