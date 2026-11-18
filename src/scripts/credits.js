import { loadLicense, licenseError } from './licenses.js';
import { setupDialog } from './dialog.js';

// Smooth scrolling, unless reduced motion is asked for (CSS's own setting doesn't reach scrollTo / scrollBy)
const scrollBehavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

// Credits library browser: selecting a project shows its license in the reader instead of opening the text file
// its link points to (what it does without this script). On phones the stacks are tabs over the list, and the reader
// lives in a bottom sheet that slides up when a project is picked.
const libraryItems = Array.from(document.querySelectorAll('.library-item'));
const libraryReader = document.getElementById('library-reader');

if (libraryItems.length > 0 && libraryReader) {
    const readerName = libraryReader.querySelector('.reader-name');
    const readerStack = libraryReader.querySelector('.reader-stack');
    const readerSpdx = libraryReader.querySelector('.reader-spdx');
    const readerLink = libraryReader.querySelector('.reader-link');
    const readerSite = libraryReader.querySelector('.reader-site');
    const readerText = libraryReader.querySelector('.reader-text');
    const libraryList = libraryItems[0].closest('.library-list');
    let readerRequest = 0;

    const showInReader = async (item) => {
        libraryItems.forEach(other => {
            const isActive = other === item;
            other.classList.toggle('active', isActive);
            if (isActive) other.setAttribute('aria-current', 'true');
            else other.removeAttribute('aria-current');
        });

        // Keep the selected project in view inside the desktop column, which scrolls on its own (the page doesn't)
        if (libraryList && libraryList.scrollHeight > libraryList.clientHeight) {
            const listRect = libraryList.getBoundingClientRect();
            const itemRect = item.getBoundingClientRect();
            if (itemRect.top < listRect.top || itemRect.bottom > listRect.bottom) {
                libraryList.scrollBy({
                    top: itemRect.top - listRect.top - (listRect.height - itemRect.height) / 2,
                    behavior: scrollBehavior
                });
            }
        }

        const name = item.querySelector('.library-name').textContent;
        readerName.textContent = name;
        libraryReader.dataset.stack = item.dataset.stack;
        readerStack.textContent = item.dataset.stackTitle || '';
        readerSpdx.textContent = item.dataset.spdx;
        readerLink.href = item.dataset.href;
        readerSite.textContent = item.dataset.site;
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

    // Phones: the reader moves into the bottom sheet, and back beside the list when the window widens
    const phone = window.matchMedia('(max-width: 860px)');
    const sheet = document.getElementById('licenseSheet');
    const sheetBody = document.getElementById('licenseSheetBody');
    const sheetPanel = sheet?.querySelector('.sheet-panel');
    const readerHome = libraryReader.parentElement;
    let sheetTrigger = null;

    const sheetDialog = sheet && sheetBody ? setupDialog(sheet, {
        onClose: () => {
            sheetPanel.style.transform = '';
            sheetTrigger?.focus();
        }
    }) : null;

    const placeReader = () => {
        if (!sheetDialog) return;
        if (phone.matches) {
            sheetBody.append(libraryReader);
        } else {
            sheetDialog.close();
            readerHome.append(libraryReader);
        }
    };
    phone.addEventListener('change', placeReader);
    placeReader();

    sheet?.querySelector('.sheet-close')?.addEventListener('click', () => sheetDialog.close());

    // Drag the handle down to close: the panel follows the finger, and a pull past a quarter of its height (or a
    // quick flick) closes it; anything less springs back
    const grab = sheet?.querySelector('.sheet-grab');
    if (grab && sheetPanel) {
        let startY = 0, startTime = 0, pull = 0, dragging = false;
        grab.addEventListener('pointerdown', (e) => {
            dragging = true;
            startY = e.clientY;
            startTime = performance.now();
            pull = 0;
            grab.setPointerCapture(e.pointerId);
            sheetPanel.classList.add('is-dragging');
        });
        grab.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            pull = Math.max(0, e.clientY - startY);
            sheetPanel.style.transform = `translateY(${pull}px)`;
        });
        const release = () => {
            if (!dragging) return;
            dragging = false;
            sheetPanel.classList.remove('is-dragging');
            const flick = pull > 40 && pull / (performance.now() - startTime) > 0.6;
            if (pull > sheetPanel.offsetHeight / 4 || flick) {
                // Slides the rest of the way down from where the finger let go
                sheetPanel.style.transform = '';
                sheetDialog.close();
            } else {
                sheetPanel.style.transform = '';
            }
        };
        grab.addEventListener('pointerup', release);
        grab.addEventListener('pointercancel', release);
    }

    libraryItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            // The sheet slides up empty rather than with the last project's license showing until the new one loads
            if (phone.matches && sheetDialog && item !== sheetTrigger) {
                readerText.textContent = '';
                readerText.scrollTop = 0;
            }
            showInReader(item);
            if (phone.matches && sheetDialog) {
                sheetTrigger = item;
                sheetDialog.open();
                // Browsers without overflow: clip still scroll the dialog to the focused control; undo that so the
                // panel slides up from the bottom (styles/credits.css)
                sheet.scrollTop = 0;
            }
        });
    });

    // Phones: the stack tabs show one stack's list at a time; the arrow keys move between them
    const stackTabs = Array.from(document.querySelectorAll('.stack-tab'));
    const libraryGroups = Array.from(document.querySelectorAll('.library-group'));
    const pickStack = (tab) => {
        stackTabs.forEach(other => other.setAttribute('aria-pressed', other === tab ? 'true' : 'false'));
        libraryGroups.forEach(group => group.classList.toggle('is-shown', group.dataset.stack === tab.dataset.stack));
    };
    stackTabs.forEach((tab, i) => {
        tab.addEventListener('click', () => pickStack(tab));
        tab.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const next = stackTabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + stackTabs.length) % stackTabs.length];
            pickStack(next);
            next.focus();
        });
    });

    showInReader(libraryItems.find(item => item.classList.contains('active')) || libraryItems[0]);
}
