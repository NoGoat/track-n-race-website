import { normalisePath, currentPath } from './paths.js';
import { setupDialog } from './dialog.js';

// Download modal: its markup is components/DownloadModal.astro, on the pages that have links marked
// data-download (components/DownloadButton.astro). Each trigger is a real link to the
// release, so without the modal (or without JavaScript) a click simply opens GitHub.
const downloadTriggers = document.querySelectorAll('[data-download]');

const setupDownloadModal = (downloadModal) => {
    const closeDownloadModal = downloadModal.querySelector('#closeDownloadModal');
    const downloadOsTabs = downloadModal.querySelectorAll('.download-os-tab');
    const downloadBuilds = downloadModal.querySelector('#downloadBuilds');
    let lastTrigger = null;
    const downloadDialog = setupDialog(downloadModal, { onClose: () => lastTrigger?.focus() });

    // The "What to choose" callout points at the comparison page; drop it when already there
    const chooseLink = downloadModal.querySelector('.download-choose a');
    if (chooseLink && normalisePath(new URL(chooseLink.href).pathname) === currentPath) {
        downloadModal.querySelector('.download-choose').remove();
    }

    // Detect the user's OS. Android's user agent also says Linux, so it's checked first.
    const detectOS = () => {
        const ua = navigator.userAgent || navigator.platform || '';
        if (/Android/.test(ua)) return 'android';
        if (/Mac|iPhone|iPad|iPod/.test(ua) && !ua.includes('Windows')) return 'macos';
        if (/Linux/.test(ua)) return 'linux';
        if (/Windows/.test(ua)) return 'windows';
        return null;
    };

    const detectedOS = detectOS();
    const osLabels = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android' };

    const switchOsTab = (os) => {
        downloadOsTabs.forEach(tab => {
            const isActive = tab.dataset.os === os;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            tab.tabIndex = isActive ? 0 : -1;
            if (isActive) downloadBuilds?.setAttribute('aria-labelledby', tab.id);
        });
        // CSS shows only the links and file types marked data-os-only for this platform
        downloadModal.dataset.os = os;
    };

    // The build links ship without an href (see components/DownloadModal.astro) and get one on first open
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

        downloadDialog.open();
        closeDownloadModal?.focus();
    };

    closeDownloadModal?.addEventListener('click', downloadDialog.close);

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
