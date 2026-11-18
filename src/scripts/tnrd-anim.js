// Home page: the TNRD animation on the Session Files highlight

// The TNRD animation: the camera looks straight down on the grid (a file icon grows into it), pans
// round to an isometric view of the cube, then Alonso's slice splits off and the whole block turns into his
// table. CSS times everything; SVG has no 3D transforms, so this projects each shape's 3D corners (data-p)
// with an orthographic camera, reading the time from .t-stage's CSS animation. Shapes marked data-f follow
// the camera only; the slice also slides and turns. Without that animation (reduced motion) it renders the
// final table, which is also the static markup. The SVG lives in its own file
// (.tnrd-frame's data-src) and is fetched and inlined here, so styles/tnrd-anim.css and this script can reach into it.
let tnrdKick = () => {};
const setupTnrd = tnrd => {
    const tnrdStage = tnrd?.querySelector('.t-stage');
    if (!tnrdStage) return;
    const shapes = Array.from(tnrd.querySelectorAll('[data-p]')).map(el => ({
        el,
        fixed: el.hasAttribute('data-f'),
        pts: el.dataset.p.split(' ').map(q => q.split(',').map(Number))
    }));
    const ISO_SCALE = 56 / Math.sqrt(2 / 3);         // isometric cube with 56px cells
    const ISO = { yaw: Math.PI / 4, pitch: Math.asin(Math.sqrt(1 / 3)), sx: ISO_SCALE, sy: ISO_SCALE };
    const FLAT = { yaw: Math.PI / 2, pitch: 0, sx: 88, sy: 88 };    // table cells are 88 x 88
    const TOP = { yaw: 0, pitch: Math.PI / 2, sx: 56, sy: 56 };     // straight down: the grid as a flat 8 x 10
    const TOP_CENTRE = [800, 500];                   // where the cube's centre sits when seen from above
    const CENTRE = [4, 5, 2.5];
    const ISO_ORIGIN = [900, 418];                   // screen position of the cube's back corner
    const PULL = 1.2;                                // how far the slice slides out, in cells
    const ANCHOR = [8, 10, 5];                       // slice's front top-left corner = table's top-left (L1, Speed)
    const TABLE = [170, 340];
    const GROW = [800, 1500], PAN = [1800, 3400], SPLIT = [6200, 7000], TURN = [7200, 8900]; // ms, matches styles/tnrd-anim.css
    // The file icon morphs into the grid's top face as seen from above: 224 x 280 with 12px corners and a
    // 56px fold, growing to 448 x 560 with square corners and no fold, centred where the grid sits
    const fileBody = tnrd.querySelector('.t-file-body'), fileFold = tnrd.querySelector('.t-file-fold');
    const n = v => v.toFixed(1);
    const drawFile = k => {
        const w = 224 + 224 * k, h = 280 + 280 * k, r = 12 * (1 - k), fold = 56 * (1 - k);
        const x0 = TOP_CENTRE[0] - w / 2, y0 = TOP_CENTRE[1] - h / 2, x1 = x0 + w, y1 = y0 + h;
        fileBody?.setAttribute('d',
            `M${n(x0)},${n(y0 + r)} Q${n(x0)},${n(y0)} ${n(x0 + r)},${n(y0)} L${n(x1 - fold)},${n(y0)} ` +
            `L${n(x1)},${n(y0 + fold)} L${n(x1)},${n(y1 - r)} Q${n(x1)},${n(y1)} ${n(x1 - r)},${n(y1)} ` +
            `L${n(x0 + r)},${n(y1)} Q${n(x0)},${n(y1)} ${n(x0)},${n(y1 - r)} Z`);
        fileFold?.setAttribute('d',
            `M${n(x1 - fold)},${n(y0)} L${n(x1 - fold)},${n(y0 + fold)} L${n(x1)},${n(y0 + fold)}`);
    };
    const ease = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const phase = (t, [a, b]) => ease(Math.min(1, Math.max(0, (t - a) / (b - a))));
    const camera = ({ yaw, pitch, sx, sy }) => {
        const cyaw = Math.cos(yaw), syaw = Math.sin(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
        return ([x, y, z]) => [sx * (x * cyaw - y * syaw), sy * ((x * syaw + y * cyaw) * sp - z * cp)];
    };
    const iso = camera(ISO);

    const render = t => {
        drawFile(phase(t, GROW));
        // the camera pans from straight down to isometric; until the turn every shape uses it
        const pan = phase(t, PAN);
        const lerp = (a, b, k) => a + (b - a) * k;
        const panCam = camera({
            yaw: lerp(TOP.yaw, ISO.yaw, pan), pitch: lerp(TOP.pitch, ISO.pitch, pan),
            sx: lerp(TOP.sx, ISO.sx, pan), sy: lerp(TOP.sy, ISO.sy, pan)
        });
        const centre = panCam(CENTRE), isoCentre = iso(CENTRE);
        const pdx = lerp(TOP_CENTRE[0], isoCentre[0] + ISO_ORIGIN[0], pan) - centre[0];
        const pdy = lerp(TOP_CENTRE[1], isoCentre[1] + ISO_ORIGIN[1], pan) - centre[1];
        const pull = PULL * phase(t, SPLIT), turn = phase(t, TURN);
        const mix = (a, b) => a + (b - a) * turn;
        const project = camera({
            yaw: mix(ISO.yaw, FLAT.yaw), pitch: mix(ISO.pitch, FLAT.pitch), sx: mix(ISO.sx, FLAT.sx), sy: mix(ISO.sy, FLAT.sy)
        });
        // keep the anchor corner on a straight path from where the split left it to the table's corner
        const anchor = [ANCHOR[0] + pull, ANCHOR[1], ANCHOR[2]];
        const from = iso(anchor), now = project(anchor);
        const dx = mix(from[0] + ISO_ORIGIN[0], TABLE[0]) - now[0];
        const dy = mix(from[1] + ISO_ORIGIN[1], TABLE[1]) - now[1];
        for (const { el, fixed, pts } of shapes) {
            const q = fixed || t < TURN[0]
                ? pts.map(([x, y, z]) => { const r = panCam([x + (fixed ? 0 : pull), y, z]); return [r[0] + pdx, r[1] + pdy]; })
                : pts.map(([x, y, z]) => { const r = project([x + pull, y, z]); return [r[0] + dx, r[1] + dy]; });
            if (el.tagName === 'line') {
                el.setAttribute('x1', q[0][0].toFixed(1));
                el.setAttribute('y1', q[0][1].toFixed(1));
                el.setAttribute('x2', q[1][0].toFixed(1));
                el.setAttribute('y2', q[1][1].toFixed(1));
            } else {
                el.setAttribute('points', q.map(v => `${v[0].toFixed(1)},${v[1].toFixed(1)}`).join(' '));
            }
        }
    };

    let tnrdRunning = false;
    const tick = () => {
        const anim = tnrdStage.getAnimations()[0];
        const t = anim ? Number(anim.currentTime) : Infinity;
        render(t);
        tnrdRunning = !!anim && anim.playState === 'running' && t < TURN[1];
        if (tnrdRunning) requestAnimationFrame(tick);
    };
    tnrdKick = () => { if (!tnrdRunning) requestAnimationFrame(tick); };
    tnrdStage.addEventListener('animationstart', tnrdKick);
    tnrdKick();
};

const tnrdFrame = document.querySelector('.tnrd-frame[data-src]');
if (tnrdFrame) {
    fetch(tnrdFrame.dataset.src)
        .then(res => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then(svg => {
            tnrdFrame.innerHTML = svg;
            const tnrd = tnrdFrame.querySelector('.tnrd-anim');
            if (!tnrd) throw new Error('no .tnrd-anim in response');
            setupTnrd(tnrd);
        })
        .catch(err => {
            // Fall back to a still of the table and charts side by side
            console.warn('TNRD animation failed to load:', err);
            tnrdKick = () => {};
            const img = new Image(1600, 1000);
            img.className = 'tnrd-static';
            img.src = tnrdFrame.dataset.fallback;
            img.alt = 'Alonso\'s slice of a .tnrd file as a table of laps and data types, with lap 5\'s speed, RPM and ERS blocks drawn as traces alongside';
            tnrdFrame.replaceChildren(img);
        });
}

// The animation plays as soon as any part of the diagram is on screen, and pauses once it is fully scrolled away
if (tnrdFrame && window.IntersectionObserver) {
    tnrdFrame.dataset.animGate = '';
    new IntersectionObserver(([entry]) => {
        tnrdFrame.classList.toggle('in-view', entry.isIntersecting);
        tnrdKick();
    }, { threshold: 0 }).observe(tnrdFrame);
}
