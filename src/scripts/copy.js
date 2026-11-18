// Copy buttons (.copy-action-btn[data-copy]) on the Setup and Troubleshooting pages. The button reads data-copy
// when clicked, so a value set later (the Setup page's link) is copied as it is then. The result is announced
// through #copyStatus, a visually hidden live region, where the page has one.
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
        span.textContent = btn.dataset.label ?? 'Copy';
    }, 2000);
};

document.querySelectorAll('.copy-action-btn[data-copy]').forEach(btn => {
    btn.dataset.label = btn.querySelector('.copy-label')?.textContent ?? 'Copy';
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const textToCopy = btn.getAttribute('data-copy');
        if (!textToCopy) return;
        // The setup link is announced by what it is, not the whole URL
        const what = btn.id === 'copySetupLink' ? 'a link to this setup' : textToCopy;

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
            announce(`Copied ${what} to the clipboard`);
        } catch (err) {
            flash(btn, 'Failed');
            announce(`Couldn't copy ${what}`);
            console.error('Failed to copy text: ', err);
        }
    });
});
