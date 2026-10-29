import { osLabels } from './platform.js';

// The link to the Setup page at the end of the download modal and the Download page (components/DownloadNext.astro).
// Once a build link is clicked, it says that download has started; the link's own default action starts it.
const buildNames = { electron: 'Track N Race', qt: 'Track N Race Native', minimal: 'the Minimal Recorder' };

export const markDownloadStarted = (block, link) => {
    const [app, os] = link.dataset.build.split('/');
    const name = app === 'android'
        ? 'Track N Race for Android'
        : `${buildNames[app] ?? 'Track N Race'} for ${osLabels[os] ?? os}`;

    block.dataset.started = '';
    block.querySelector('[data-next-status]').textContent = 'Download started';
    block.querySelector('[data-next-name]').textContent = name;
    block.querySelector('[data-next-idle]').hidden = true;
    block.querySelector('[data-next-started]').hidden = false;
    block.querySelector('[data-next-retry]').hidden = false;
    block.querySelector('[data-next-retry] a').href = link.href;
    // A desktop build says which OS that computer runs. The APK doesn't say whether the phone works alone
    // or paired with a computer, so that's left for the user to answer.
    block.querySelector('[data-next-setup]').href = app === 'android' ? '/setup/' : `/setup/?os=${os}`;
};
