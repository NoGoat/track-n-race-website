// Gallery: the Electron / Qt / Android switch is a radio group that styles/gallery.css follows, so it works without
// this script. This keeps the pick in the URL (#qt, #android) so a link can open the gallery on it.
const gallery = document.querySelector('.gallery-section');
if (gallery) {
    gallery.addEventListener('change', (e) => {
        if (e.target.name !== 'ui') return;
        const ui = e.target.value;
        history.replaceState(null, '', ui === 'electron' ? location.pathname + location.search : `#${ui}`);
    });

    if (location.hash === '#qt' || location.hash === '#android') {
        document.getElementById(`ui-${location.hash.slice(1)}`).checked = true;
    }
}
