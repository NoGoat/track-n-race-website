import { loadLicense, licenseError } from './licenses.js';

// Smooth scrolling, unless reduced motion is asked for (CSS's own setting doesn't reach scrollTo / scrollBy)
const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

// Credits library browser: selecting a project shows its license in the reader instead of opening the text file
// its link points to (what it does without this script). On phones the list is a horizontal strip above the reader.
const libraryItems = Array.from(document.querySelectorAll('.library-item'));
const libraryReader = document.getElementById('library-reader');

if (libraryItems.length > 0 && libraryReader) {
    const readerName = libraryReader.querySelector('.reader-name');
    const readerStack = libraryReader.querySelector('.reader-stack');
    const readerSpdx = libraryReader.querySelector('.reader-spdx');
    const readerLink = libraryReader.querySelector('.reader-link');
    const readerText = libraryReader.querySelector('.reader-text');
    const libraryList = libraryItems[0].closest('.library-list');
    const stackLabels = { core: 'Core', electron: 'Electron', qt: 'Native' };
    let readerRequest = 0;

    const showInReader = async (item) => {
        libraryItems.forEach(other => {
            const isActive = other === item;
            other.classList.toggle('active', isActive);
            if (isActive) other.setAttribute('aria-current', 'true');
            else other.removeAttribute('aria-current');
        });

        // Keep the selected project in view inside the list: centred in the phone strip,
        // scrolled into view in the desktop column (the page itself never scrolls)
        if (libraryList) {
            const listRect = libraryList.getBoundingClientRect();
            const itemRect = item.getBoundingClientRect();
            if (libraryList.scrollWidth > libraryList.clientWidth) {
                libraryList.scrollBy({
                    left: itemRect.left - listRect.left - (listRect.width - itemRect.width) / 2,
                    behavior: scrollBehavior
                });
            } else if (itemRect.top < listRect.top || itemRect.bottom > listRect.bottom) {
                libraryList.scrollBy({
                    top: itemRect.top - listRect.top - (listRect.height - itemRect.height) / 2,
                    behavior: scrollBehavior
                });
            }
        }

        const name = item.querySelector('.library-name').textContent;
        readerName.textContent = name;
        readerStack.dataset.stack = item.dataset.stack;
        readerStack.textContent = stackLabels[item.dataset.stack] || '';
        readerSpdx.textContent = item.dataset.spdx;
        readerLink.href = item.dataset.href;
        readerLink.setAttribute('aria-label', `${name} website`);

        const request = ++readerRequest;
        readerText.classList.add('is-loading');
        try {
            const text = await loadLicense(item.dataset.file);
            if (request !== readerRequest) return;
            readerText.textContent = text;
            readerText.scrollTop = 0;
        } catch (error) {
            if (request === readerRequest) readerText.textContent = licenseError;
            console.error(error);
        } finally {
            if (request === readerRequest) readerText.classList.remove('is-loading');
        }
    };

    libraryItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            showInReader(item);
        });
    });

    showInReader(libraryItems.find(item => item.classList.contains('active')) || libraryItems[0]);
}
