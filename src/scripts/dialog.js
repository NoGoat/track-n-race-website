// Pop-ups (license, download, lightbox) are <dialog>s opened with showModal(): the browser moves focus in, keeps it
// there and makes the page behind inert. .active runs each one's fade in and out (their CSS), and the page
// stops scrolling while one is open. onClose runs once the dialog has really closed, however that happened.
const FADE_MS = 200;

const lockScroll = (lock) => {
    for (const el of [document.documentElement, document.body]) {
        el.classList.toggle('modal-open', lock);
        el.style.overflow = lock ? 'hidden' : '';
    }
};

export const setupDialog = (dialog, { onClose } = {}) => {
    let closeTimer = 0;

    const open = () => {
        clearTimeout(closeTimer);
        if (!dialog.open) dialog.showModal();
        lockScroll(true);
        void dialog.offsetWidth; // lay it out at opacity 0 first, so the fade in runs
        dialog.classList.add('active');
    };

    // Fade out, then close; the page stays inert until then, so focus goes back to it in onClose
    const close = () => {
        if (!dialog.open) return;
        dialog.classList.remove('active');
        clearTimeout(closeTimer);
        closeTimer = setTimeout(() => dialog.close(), FADE_MS);
    };

    // Esc: fade out like the close button instead of vanishing
    dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        close();
    });

    dialog.addEventListener('close', () => {
        clearTimeout(closeTimer);
        dialog.classList.remove('active');
        lockScroll(false);
        onClose?.();
    });

    // A click on the overlay itself (outside the pop-up's content)
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) close();
    });

    return { open, close };
};
