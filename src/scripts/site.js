// Every page: the navbar and the footer's license pop-up
import { normalisePath, currentPath } from './paths.js';
import { loadLicense, licenseError } from './licenses.js';

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

// License Modal Logic
const licenseModal = document.getElementById('licenseModal');
const closeLicenseModal = document.getElementById('closeLicenseModal');
const licenseTextContent = document.getElementById('licenseTextContent');
const licenseModalTitle = document.getElementById('licenseModalTitle');
let licenseModalRequest = 0;

const openLicenseModal = async (title, file) => {
    if (!licenseModal) return;
    const request = ++licenseModalRequest;
    licenseModalTitle.textContent = title;
    licenseTextContent.textContent = 'Loading...';
    licenseModal.classList.add('active');
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    try {
        const text = await loadLicense(file);
        if (request === licenseModalRequest) licenseTextContent.textContent = text;
    } catch (error) {
        if (request === licenseModalRequest) licenseTextContent.textContent = licenseError;
        console.error(error);
    }
};

if (licenseModal) {
    // Footer GPL link (a non-button trigger, so it needs keyboard activation too)
    document.querySelectorAll('[data-license]').forEach(btn => {
        if (btn.tagName !== 'BUTTON') {
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    btn.click();
                }
            });
        }
        btn.addEventListener('click', () => openLicenseModal('Track N Race License', btn.getAttribute('data-license')));
    });

    const closeModal = () => {
        licenseModal.classList.remove('active');
        document.documentElement.classList.remove('modal-open');
        document.body.classList.remove('modal-open');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
    };

    closeLicenseModal?.addEventListener('click', closeModal);

    licenseModal.addEventListener('click', (e) => {
        if (e.target === licenseModal) {
            closeModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && licenseModal.classList.contains('active')) {
            closeModal();
        }
    });
}
