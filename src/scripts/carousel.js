// Home page: the Highlights and Qt screenshot carousels, and the TNRD animation on Highlights' first slide

// Slide 1's TNRD animation: the camera looks straight down on the grid (a file icon grows into it), pans
// round to an isometric view of the cube, then Alonso's slice splits off and the whole block turns into his
// table. CSS times everything; SVG has no 3D transforms, so this projects each shape's 3D corners (data-p)
// with an orthographic camera, reading the time from .t-stage's CSS animation. Shapes marked data-f follow
// the camera only; the slice also slides and turns. Without that animation (reduced motion, inactive
// slide) it renders the final table, which is also the static markup. The SVG lives in its own file
// (.tnrd-frame's data-src) and is fetched and inlined here, so styles/carousel.css and this script can reach into it.
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
    const GROW = [800, 1500], PAN = [1800, 3400], SPLIT = [6200, 7000], TURN = [7200, 8900]; // ms, matches styles/carousel.css
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

// Carousels: Highlights and the Qt screens on the home page, each runs on its own
document.querySelectorAll('.carousel-container').forEach(carouselContainer => {
    const viewport = carouselContainer.querySelector('.carousel-viewport');
    const track = carouselContainer.querySelector('.carousel-track');
    const slides = Array.from(track?.children || []);
    const nextButton = carouselContainer.querySelector('.carousel-btn.next');
    const prevButton = carouselContainer.querySelector('.carousel-btn.prev');
    const dotsNav = carouselContainer.querySelector('.carousel-indicators');
    const dots = Array.from(dotsNav?.children || []);

    if (viewport && track && slides.length > 0) {
        let currentSlideIndex = 0;
        const gap = 48; // Physical buffer gap between slides in px

        const updateCarousel = (index, animate = true) => {
            currentSlideIndex = ((index % slides.length) + slides.length) % slides.length;
            const viewportWidth = viewport.getBoundingClientRect().width;
            if (viewportWidth === 0) return;

            slides.forEach((slide, i) => {
                slide.style.width = `${viewportWidth}px`;
                slide.classList.toggle('active', i === currentSlideIndex);
            });

            const offset = currentSlideIndex * (viewportWidth + gap);
            track.style.transition = animate ? 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1)' : 'none';
            track.style.transform = `translate3d(-${offset}px, 0, 0)`;

            dots.forEach((dot, i) => {
                dot.classList.toggle('active', i === currentSlideIndex);
            });

            tnrdKick();
        };

        updateCarousel(0, false);

        // Keep dimensions perfectly synced on resize and zoom change
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => {
                updateCarousel(currentSlideIndex, false);
            });
            ro.observe(viewport);
        } else {
            window.addEventListener('resize', () => updateCarousel(currentSlideIndex, false));
        }

        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let carouselVisible = true;
        // The TNRD animation slide stays long enough to play and settle; the others move on quickly
        const slideMs = () => (slides[currentSlideIndex]?.querySelector('.tnrd-frame') ? 20000 : 5000);

        const resetAutoPlay = () => {
            clearTimeout(autoPlayInterval);
            if (reduceMotion || !carouselVisible) return;
            autoPlayInterval = setTimeout(() => {
                updateCarousel(currentSlideIndex + 1);
                resetAutoPlay();
            }, slideMs());
        };

        nextButton?.addEventListener('click', () => {
            updateCarousel(currentSlideIndex + 1);
            resetAutoPlay();
        });

        prevButton?.addEventListener('click', () => {
            updateCarousel(currentSlideIndex - 1);
            resetAutoPlay();
        });

        dotsNav?.addEventListener('click', e => {
            const targetDot = e.target.closest('.dot');
            if (!targetDot) return;
            const index = dots.indexOf(targetDot);
            if (index !== -1) {
                updateCarousel(index);
                resetAutoPlay();
            }
        });

        // Touch Swipe Support for Mobile
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let touchEndY = 0;

        track.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].clientX;
            touchStartY = e.changedTouches[0].clientY;
            clearTimeout(autoPlayInterval);
        }, { passive: true });

        track.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].clientX;
            touchEndY = e.changedTouches[0].clientY;
            const diffX = touchStartX - touchEndX;
            const diffY = touchStartY - touchEndY;

            // Only trigger horizontal swipe if horizontal movement is greater than vertical movement
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 35) {
                if (diffX > 0) {
                    // Swiped Left -> Next Slide
                    updateCarousel(currentSlideIndex + 1);
                } else {
                    // Swiped Right -> Prev Slide
                    updateCarousel(currentSlideIndex - 1);
                }
            }
            resetAutoPlay();
        }, { passive: true });

        // Auto-play: one timeout per slide, rescheduled after each move
        let autoPlayInterval = null;
        resetAutoPlay();

        // Pause on hover
        carouselContainer.addEventListener('mouseenter', () => clearTimeout(autoPlayInterval));
        carouselContainer.addEventListener('mouseleave', () => resetAutoPlay());

        // Pause while scrolled out of view, so it doesn't keep animating unseen
        if (window.IntersectionObserver) {
            new IntersectionObserver(([entry]) => {
                carouselVisible = entry.isIntersecting;
                if (carouselVisible) {
                    resetAutoPlay();
                } else {
                    clearTimeout(autoPlayInterval);
                }
            }).observe(carouselContainer);

            // Slide 1's TNRD animation waits at its first frame until the carousel is mostly on screen
            carouselContainer.dataset.animGate = '';
            new IntersectionObserver(([entry]) => {
                carouselContainer.classList.toggle('in-view', entry.isIntersecting);
                tnrdKick();
            }, { threshold: 0.4 }).observe(carouselContainer);
        }
    }
});
