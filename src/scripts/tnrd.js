// TNRD page: highlight the version rail entry for the section being read
const fmtLinks = Array.from(document.querySelectorAll('.fmt-rail-link'));
if (fmtLinks.length && window.IntersectionObserver) {
    const byId = new Map(fmtLinks.map(link => [link.getAttribute('href').slice(1), link]));
    const visible = new Set();
    const sync = () => {
        const first = fmtLinks.find(link => visible.has(link.getAttribute('href').slice(1)));
        fmtLinks.forEach(link => {
            link.classList.toggle('active', link === first);
            if (link === first) link.setAttribute('aria-current', 'true');
            else link.removeAttribute('aria-current');
        });
    };
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target.id) : visible.delete(entry.target.id));
        sync();
    }, { rootMargin: '-40% 0px -55% 0px' });
    byId.forEach((_, id) => { const section = document.getElementById(id); if (section) observer.observe(section); });
}
