import './copy.js';
import './tabs.js';

// Troubleshooting page. The filter (what runs Track N Race) and the search hide the fixes that don't match, and
// each section counts what's left. ?for=<os> starts the filter on a setup, as the Setup page's links do, and
// #fix-<id> opens that fix. Without JavaScript the filter isn't shown and every fix is there to open.
const form = document.getElementById('fixFilter');
const search = document.getElementById('fixSearch');
const empty = document.getElementById('fixEmpty');
const sections = Array.from(document.querySelectorAll('[data-fix-section]'));
const FILTERS = ['all', 'windows', 'macos', 'linux', 'android'];

const current = () => form.elements.for.value || 'all';

const apply = () => {
    const filter = current();
    const query = search.value.trim().toLowerCase();
    let any = false;
    sections.forEach(section => {
        let shown = 0;
        section.querySelectorAll('.fix-card').forEach(card => {
            const forOk = filter === 'all' || card.dataset.for.split(' ').includes(filter);
            const textOk = !query || card.textContent.toLowerCase().includes(query);
            card.hidden = !(forOk && textOk);
            if (!card.hidden) shown += 1;
        });
        section.hidden = shown === 0;
        section.querySelector('[data-fix-count]').textContent = `· ${shown} ${shown === 1 ? 'fix' : 'fixes'}`;
        if (shown) any = true;
    });
    empty.hidden = any;
};

// Keep the filter in the address, so a link keeps it
const remember = () => {
    const url = new URL(location.href);
    if (current() === 'all') url.searchParams.delete('for'); else url.searchParams.set('for', current());
    history.replaceState(null, '', url.pathname + url.search + url.hash);
};

// Open the fix the address points at, showing every fix first if the filter hides it
const openFromHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id.startsWith('fix-')) return;
    const card = document.getElementById(id);
    if (!card) return;
    if (card.hidden) {
        form.elements.for.value = 'all';
        search.value = '';
        apply();
        remember();
    }
    card.open = true;
    card.classList.remove('flash');
    void card.offsetWidth; // restart the highlight
    card.classList.add('flash');
    card.scrollIntoView({ block: 'start' });
};

const start = new URLSearchParams(location.search).get('for');
if (FILTERS.includes(start)) form.elements.for.value = start;

form.addEventListener('change', () => { apply(); remember(); });
form.addEventListener('submit', e => e.preventDefault());
search.addEventListener('input', apply);
window.addEventListener('hashchange', openFromHash);

apply();
openFromHash();
