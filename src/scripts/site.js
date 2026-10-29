// Every page: the navbar and the footer's license pop-up
import { normalisePath, currentPath } from './paths.js';
import { loadLicense, licenseError } from './licenses.js';
import { setupDialog } from './dialog.js';

// Mobile Navigation Toggle
const mobileToggleBtn = document.getElementById('mobileToggleBtn');
const navMenu = document.querySelector('.nav-menu');

if (mobileToggleBtn && navMenu) {
    mobileToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = navMenu.classList.toggle('mobile-active');
        mobileToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
        if (navMenu.classList.contains('mobile-active') && !navMenu.contains(e.target) && !mobileToggleBtn.contains(e.target)) {
            navMenu.classList.remove('mobile-active');
            mobileToggleBtn.setAttribute('aria-expanded', 'false');
        }
    });

    // Close menu on Esc, back to the toggle
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navMenu.classList.contains('mobile-active')) {
            navMenu.classList.remove('mobile-active');
            mobileToggleBtn.setAttribute('aria-expanded', 'false');
            mobileToggleBtn.focus();
        }
    });

    // Close menu on link click
    navMenu.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            navMenu.classList.remove('mobile-active');
            mobileToggleBtn.setAttribute('aria-expanded', 'false');
        });
    });
}

// Set active navigation button based on current URL path
const navButtons = document.querySelectorAll('.nav-btn');

navButtons.forEach(btn => {
    const href = btn.getAttribute('href');
    if (!href) return;

    btn.classList.toggle('active', normalisePath(href) === currentPath);
});

// License pop-up (the footer's GPL link)
const licenseModal = document.getElementById('licenseModal');
const closeLicenseModal = document.getElementById('closeLicenseModal');
const licenseTextContent = document.getElementById('licenseTextContent');
const licenseModalTitle = document.getElementById('licenseModalTitle');
let licenseModalRequest = 0;

if (licenseModal) {
    let lastTrigger = null;
    const licenseDialog = setupDialog(licenseModal, { onClose: () => lastTrigger?.focus() });

    const openLicenseModal = async (title, file) => {
        const request = ++licenseModalRequest;
        licenseModalTitle.textContent = title;
        licenseTextContent.textContent = 'Loading...';
        licenseDialog.open();
        closeLicenseModal?.focus();

        try {
            const text = await loadLicense(file);
            if (request === licenseModalRequest) licenseTextContent.textContent = text;
        } catch (error) {
            if (request === licenseModalRequest) licenseTextContent.textContent = licenseError;
            console.error(error);
        }
    };

    // The trigger is a link to the text file, for when this script doesn't run
    document.querySelectorAll('[data-license]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            lastTrigger = btn;
            openLicenseModal('Track N Race License', btn.getAttribute('data-license'));
        });
    });

    closeLicenseModal?.addEventListener('click', licenseDialog.close);
}
