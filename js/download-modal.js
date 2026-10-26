import { normalisePath, currentPath } from './paths.js';

// Download modal: its markup lives in partials/download-modal.html and is built into every page
// with links marked data-download (scripts/partials.mjs). Each trigger is a real link to the
// release, so without the modal (or without JavaScript) a click simply opens GitHub.
const downloadTriggers = document.querySelectorAll('[data-download]');

const setupDownloadModal = (downloadModal) => {
    const closeDownloadModal = downloadModal.querySelector('#closeDownloadModal');
    const downloadOsTabs = downloadModal.querySelectorAll('.download-os-tab');
    let lastTrigger = null;

    // The "What to choose" callout points at the comparison page; drop it when already there
    const chooseLink = downloadModal.querySelector('.download-choose a');
    if (chooseLink && normalisePath(new URL(chooseLink.href).pathname) === currentPath) {
        downloadModal.querySelector('.download-choose').remove();
    }

    // Detect the user's OS
    const detectOS = () => {
        const ua = navigator.userAgent || navigator.platform || '';
        if (/Mac|iPhone|iPad|iPod/.test(ua) && !ua.includes('Windows')) return 'macos';
        if (/Linux/.test(ua) && !/Android/.test(ua)) return 'linux';
        if (/Windows/.test(ua)) return 'windows';
        return null;
    };

    const detectedOS = detectOS();
    const osLabels = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

    const switchOsTab = (os) => {
        downloadOsTabs.forEach(tab => {
            const isActive = tab.dataset.os === os;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            tab.tabIndex = isActive ? 0 : -1;
        });
        // CSS shows only the links and file types marked data-os-only for this platform
        downloadModal.dataset.os = os;
    };

    // The build links ship without an href (see partials/download-modal.html) and get one on first open
    const fillBuildLinks = () => {
        downloadModal.querySelectorAll('a[data-build]:not([href])').forEach(link => {
            link.href = `/download/${link.dataset.build}`;
            link.rel = 'nofollow';
        });
    };

    const openDownloadModal = (trigger) => {
        lastTrigger = trigger;
        fillBuildLinks();
        // Counted by worker/index.js; the downloads themselves are counted by their /download/ redirects
        navigator.sendBeacon?.(`/api/event?name=download_modal_open&os=${detectedOS || ''}`);
        // Unsupported platforms (phones, tablets, ...) fall back to the Windows builds
        switchOsTab(detectedOS || 'windows');

        const noteEl = downloadModal.querySelector('#downloadDetectedNote');
        if (noteEl) noteEl.textContent = detectedOS
            ? `${osLabels[detectedOS]} detected`
            : 'Desktop only';

        downloadModal.classList.add('active');
        document.documentElement.classList.add('modal-open');
        document.body.classList.add('modal-open');
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        closeDownloadModal?.focus();
    };

    const closeDownloadModalFn = () => {
        downloadModal.classList.remove('active');
        document.documentElement.classList.remove('modal-open');
        document.body.classList.remove('modal-open');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        lastTrigger?.focus();
    };

    closeDownloadModal?.addEventListener('click', closeDownloadModalFn);

    downloadModal.addEventListener('click', (e) => {
        if (e.target === downloadModal) closeDownloadModalFn();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && downloadModal.classList.contains('active')) {
            closeDownloadModalFn();
        }
    });

    // OS tab switching
    downloadOsTabs.forEach(tab => {
        tab.addEventListener('click', () => switchOsTab(tab.dataset.os));

        tab.addEventListener('keydown', (e) => {
            const tabs = Array.from(downloadOsTabs);
            const idx = tabs.indexOf(tab);
            let target = null;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = (idx + 1) % tabs.length;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = (idx - 1 + tabs.length) % tabs.length;
            else if (e.key === 'Home') target = 0;
            else if (e.key === 'End') target = tabs.length - 1;
            if (target !== null) {
                e.preventDefault();
                switchOsTab(tabs[target].dataset.os);
                tabs[target].focus();
            }
        });
    });

    return openDownloadModal;
};

const downloadModal = document.getElementById('downloadModal');
if (downloadModal && downloadTriggers.length > 0) {
    const openDownloadModal = setupDownloadModal(downloadModal);

    downloadTriggers.forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            openDownloadModal(trigger);
        });
    });
}
