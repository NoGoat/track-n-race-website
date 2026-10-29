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

    // After a build is clicked, the modal swaps to "Download started" with a link to the Setup page
    const nextPanel = downloadModal.querySelector('#downloadNext');
    const nextName = downloadModal.querySelector('#downloadNextName');
    const nextSetup = downloadModal.querySelector('#downloadNextSetup');
    const nextRetry = downloadModal.querySelector('#downloadNextRetry');
    const buildNames = { electron: 'Track N Race', qt: 'Track N Race Native', minimal: 'the Minimal Recorder' };

    const showNext = (link) => {
        const [app, os] = link.dataset.build.split('/');
        if (nextName) nextName.textContent = app === 'android'
            ? 'Track N Race for Android'
            : `${buildNames[app] ?? 'Track N Race'} for ${osLabels[os] ?? os}`;
        // A desktop build says which OS that computer runs. The APK doesn't say whether the phone works alone
        // or paired with a computer, so that's left for the user to answer.
        if (nextSetup) nextSetup.href = app === 'android' ? '/setup/' : `/setup/?os=${os}`;
        if (nextRetry) nextRetry.href = link.href;
        downloadModal.dataset.step = 'next';
        nextPanel?.focus();
    };

    const showBuilds = () => {
        delete downloadModal.dataset.step;
    };

    // The link's own default action starts the download; this only changes what the modal shows
    downloadModal.querySelectorAll('a.download-build-get[data-build]').forEach(link => {
        link.addEventListener('click', () => showNext(link));
    });

    downloadModal.querySelector('#downloadNextBack')?.addEventListener('click', () => {
        showBuilds();
        downloadModal.querySelector('.download-os-tab.active')?.focus();
    });

    // Already on the Setup page: reloading it would wipe the answers given so far, so just close the modal
    nextSetup?.addEventListener('click', (e) => {
        if (currentPath !== '/setup') return;
        e.preventDefault();
        downloadDialog.close();
    });

    const openDownloadModal = (trigger) => {
        lastTrigger = trigger;
        showBuilds();
        fillBuildLinks();
        // Counted by worker/index.js; the downloads themselves are counted by their /download/ redirects
        navigator.sendBeacon?.(`/api/event?name=download_modal_open&os=${detectedOS || ''}`);
        // Unsupported platforms (phones, tablets, ...) fall back to the Windows builds
        switchOsTab(detectedOS || 'windows');

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
