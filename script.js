document.addEventListener('DOMContentLoaded', () => {
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
    // Normalise "/setup", "/setup/" and "/setup/index.html" to "/setup"
    const normalisePath = path => path.toLowerCase()
        .replace(/(index)?(\.html)?$/, '')
        .replace(/\/+$/, '');
    const currentPath = normalisePath(window.location.pathname);

    navButtons.forEach(btn => {
        const href = btn.getAttribute('href');
        if (!href) return;

        btn.classList.toggle('active', normalisePath(href) === currentPath);
    });

    // Slide 1's TNRD animation: the camera looks straight down on the grid (a file icon grows into it), pans
    // round to an isometric view of the cube, then Alonso's slice splits off and the whole block turns into his
    // table. CSS times everything; SVG has no 3D transforms, so this projects each shape's 3D corners (data-p)
    // with an orthographic camera, reading the time from .t-stage's CSS animation. Shapes marked data-f follow
    // the camera only; the slice also slides and turns. Without that animation (reduced motion, inactive
    // slide) it renders the final table, which is also the static markup. The SVG lives in its own file
    // (.tnrd-frame's data-src) and is fetched and inlined here, so styles.css and this script can reach into it.
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
        const GROW = [800, 1500], PAN = [1800, 3400], SPLIT = [6200, 7000], TURN = [7200, 8900]; // ms, matches styles.css
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

    // TNRD version rail and Gallery header: they go edge to edge once they stick under the navbar
    const stickyBar = document.querySelector('.fmt-rail, .gallery-head');
    if (stickyBar) {
        let railFrame = 0;
        const syncRail = () => {
            railFrame = 0;
            const stickAt = parseFloat(getComputedStyle(stickyBar).top) || 0;
            stickyBar.classList.toggle('is-stuck', stickyBar.getBoundingClientRect().top <= stickAt + 0.5);
        };
        const queueRail = () => { if (!railFrame) railFrame = requestAnimationFrame(syncRail); };
        window.addEventListener('scroll', queueRail, { passive: true });
        window.addEventListener('resize', queueRail);
        syncRail();
    }

    // TNRD page: highlight the version rail entry for the section being read
    const fmtLinks = Array.from(document.querySelectorAll('.fmt-rail-link'));
    if (fmtLinks.length && window.IntersectionObserver) {
        const byId = new Map(fmtLinks.map(link => [link.getAttribute('href').slice(1), link]));
        const visible = new Set();
        const sync = () => {
            const first = fmtLinks.find(link => visible.has(link.getAttribute('href').slice(1)));
            fmtLinks.forEach(link => link.classList.toggle('active', link === first));
        };
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target.id) : visible.delete(entry.target.id));
            sync();
        }, { rootMargin: '-40% 0px -55% 0px' });
        byId.forEach((_, id) => { const section = document.getElementById(id); if (section) observer.observe(section); });
    }

    // Module switchers (Compare Frontends): one tab per module, one visible
    // screenshot. Each .modules block switches independently.
    document.querySelectorAll('.modules').forEach(modules => {
        const moduleTabs = Array.from(modules.querySelectorAll('.module-tab'));
        const modulePanes = Array.from(modules.querySelectorAll('.module-pane'));
        if (moduleTabs.length === 0 || moduleTabs.length !== modulePanes.length) return;
        const moduleList = moduleTabs[0].parentElement;

        const selectModule = (index, focus = false) => {
            moduleTabs.forEach((tab, i) => {
                const isActive = i === index;
                tab.classList.toggle('active', isActive);
                tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
                tab.tabIndex = isActive ? 0 : -1;
                modulePanes[i].classList.toggle('active', isActive);
                if (isActive) {
                    modulePanes[i].removeAttribute('aria-hidden');
                } else {
                    modulePanes[i].setAttribute('aria-hidden', 'true');
                }
            });

            const tab = moduleTabs[index];
            if (focus) tab.focus({ preventScroll: true });

            // On phones the list is a horizontal strip: keep the active tab centred in it
            if (moduleList.scrollWidth > moduleList.clientWidth) {
                moduleList.scrollTo({
                    left: tab.offsetLeft - (moduleList.clientWidth - tab.offsetWidth) / 2,
                    behavior: 'smooth'
                });
            }
        };

        moduleTabs.forEach((tab, i) => {
            tab.addEventListener('click', () => selectModule(i));

            tab.addEventListener('keydown', (e) => {
                const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
                let target = null;
                if (step) target = (i + step + moduleTabs.length) % moduleTabs.length;
                else if (e.key === 'Home') target = 0;
                else if (e.key === 'End') target = moduleTabs.length - 1;
                if (target === null) return;
                e.preventDefault();
                selectModule(target, true);
            });
        });
    });

    // Gallery: the Electron / Qt switch shows every screen in the picked frontend.
    // The pick is kept in the URL (#qt) so a link can open the gallery on Qt.
    const gallery = document.querySelector('.gallery-section');
    if (gallery) {
        const switchBtns = Array.from(gallery.querySelectorAll('.gallery-switch-btn'));
        const pickUi = (ui, focus = false) => {
            gallery.dataset.ui = ui;
            switchBtns.forEach(btn => {
                const isActive = btn.dataset.ui === ui;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
                btn.tabIndex = isActive ? 0 : -1;
                if (isActive && focus) btn.focus();
            });
            history.replaceState(null, '', ui === 'qt' ? '#qt' : location.pathname + location.search);
        };

        switchBtns.forEach((btn, i) => {
            btn.addEventListener('click', () => pickUi(btn.dataset.ui));
            btn.addEventListener('keydown', (e) => {
                const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
                if (!step) return;
                e.preventDefault();
                pickUi(switchBtns[(i + step + switchBtns.length) % switchBtns.length].dataset.ui, true);
            });
        });

        if (location.hash === '#qt') pickUi('qt');
    }

    // Compare Frontends sliders: the range input's value drives the clip position
    document.querySelectorAll('.compare').forEach(compare => {
        const range = compare.querySelector('.compare-range');
        if (!range) return;
        const update = () => compare.style.setProperty('--pos', `${range.value}%`);
        range.addEventListener('input', update);
        update();
    });

    // Lightbox Logic & Fluid GPU Zoom & Pan Algorithm
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = lightbox?.querySelector('img');
    const lightboxClose = document.getElementById('lightboxClose');
    const clickableImages = document.querySelectorAll('.mockup-img');

    if (lightbox && lightboxImg) {
        let currentScale = 1;
        let translateX = 0;
        let translateY = 0;
        let isDragging = false;
        let isMoved = false;
        let startX = 0;
        let startY = 0;
        let initialTranslateX = 0;
        let initialTranslateY = 0;

        const applyTransform = (animate = true) => {
            lightboxImg.style.transition = animate ? 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)' : 'none';
            lightboxImg.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${currentScale})`;
        };

        const clampPan = () => {
            if (currentScale <= 1) {
                translateX = 0;
                translateY = 0;
                return;
            }
            const scaledW = (lightboxImg.offsetWidth || window.innerWidth * 0.9) * currentScale;
            const scaledH = (lightboxImg.offsetHeight || window.innerHeight * 0.88) * currentScale;
            const maxPanX = Math.max(0, (scaledW - window.innerWidth) / 2 + 50);
            const maxPanY = Math.max(0, (scaledH - window.innerHeight) / 2 + 50);

            translateX = Math.min(maxPanX, Math.max(-maxPanX, translateX));
            translateY = Math.min(maxPanY, Math.max(-maxPanY, translateY));
        };

        let lightboxLoadId = 0;

        const openLightbox = (src, previewSrc) => {
            // Show the already-loaded card image instantly so the previous image never flashes,
            // then swap in the full-size file once it has downloaded and decoded.
            const loadId = ++lightboxLoadId;
            lightboxImg.src = previewSrc || src;
            if (previewSrc && previewSrc !== src) {
                const full = new Image();
                full.src = src;
                full.decode()
                    .catch(() => {})
                    .then(() => {
                        if (loadId === lightboxLoadId) lightboxImg.src = src;
                    });
            }
            currentScale = 1;
            translateX = 0;
            translateY = 0;
            lightbox.classList.remove('is-zoomed', 'is-dragging');
            applyTransform(false);
            lightbox.classList.add('active');
            document.documentElement.classList.add('modal-open');
            document.body.classList.add('modal-open');
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';
        };

        const closeLightbox = () => {
            lightboxLoadId++;
            lightbox.style.backgroundColor = '';
            lightbox.classList.remove('active', 'is-zoomed', 'is-dragging');
            currentScale = 1;
            translateX = 0;
            translateY = 0;
            applyTransform(false);
            document.documentElement.classList.remove('modal-open');
            document.body.classList.remove('modal-open');
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
        };

        clickableImages.forEach(wrapper => {
            wrapper.addEventListener('click', () => {
                const img = wrapper.tagName === 'IMG' ? wrapper : wrapper.querySelector('img');
                if (img && img.src) {
                    // Open the lossless full-size PNG that sits next to every screenshot's WebP
                    // (e.g. overview.webp -> overview.png); the compressed card image shows meanwhile.
                    const fullPng = img.src.replace(/\.[a-z0-9]+(?=$|[?#])/i, '.png');
                    openLightbox(fullPng, img.currentSrc || img.src);
                }
            });
        });

        lightboxClose?.addEventListener('click', (e) => {
            e.stopPropagation();
            closeLightbox();
        });

        // Close on background click (when clicking outside the image)
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox || e.target.id === 'lightboxScroll' || e.target.id === 'lightboxCenterer') {
                closeLightbox();
            }
        });

        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && lightbox.classList.contains('active')) {
                closeLightbox();
            }
        });

        // Click / Drag on image
        lightboxImg.addEventListener('dragstart', (e) => e.preventDefault());

        const handlePointerDown = (clientX, clientY) => {
            if (currentScale <= 1) return;
            isDragging = true;
            isMoved = false;
            startX = clientX;
            startY = clientY;
            initialTranslateX = translateX;
            initialTranslateY = translateY;
            lightbox.classList.add('is-dragging');
            lightboxImg.style.transition = 'none';
        };

        const handlePointerMove = (clientX, clientY) => {
            if (!isDragging) return;
            const deltaX = clientX - startX;
            const deltaY = clientY - startY;
            if (Math.hypot(deltaX, deltaY) > 5) {
                isMoved = true;
            }
            translateX = initialTranslateX + deltaX;
            translateY = initialTranslateY + deltaY;
            clampPan();
            applyTransform(false);
        };

        const handlePointerUp = () => {
            if (!isDragging) return;
            isDragging = false;
            lightbox.classList.remove('is-dragging');
            applyTransform(true);
        };

        // Mouse Events
        lightboxImg.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            handlePointerDown(e.clientX, e.clientY);
        });

        window.addEventListener('mousemove', (e) => {
            handlePointerMove(e.clientX, e.clientY);
        });

        window.addEventListener('mouseup', () => {
            handlePointerUp();
        });

        // Touch gestures: pinch to zoom, one finger to pan when zoomed, double-tap to zoom in or out,
        // swipe up or down to close when not zoomed, tap the backdrop to close. touchstart cancels the
        // emulated mouse events and clicks, so the mouse handlers never see touch input.
        const TOUCH_MAX_SCALE = 4;
        const DOUBLE_TAP_SCALE = 2.5;
        const TAP_SLOP = 10;
        let gesture = null;
        let lastTap = { time: 0, x: 0, y: 0 };

        const centre = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        const touchDistance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const touchMidpoint = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });

        const setZoomed = () => lightbox.classList.toggle('is-zoomed', currentScale > 1);

        // Zoom to `scale` keeping the screen point (x, y) over the same spot of the image
        const zoomTo = (scale, x, y) => {
            const c = centre();
            const ratio = scale / currentScale;
            translateX = (x - c.x) - ((x - c.x) - translateX) * ratio;
            translateY = (y - c.y) - ((y - c.y) - translateY) * ratio;
            currentScale = scale;
        };

        const resetZoom = () => {
            currentScale = 1;
            translateX = 0;
            translateY = 0;
        };

        const startPan = (touch) => {
            // Swipe-to-close only starts from a fresh one-finger touch, never from the tail of a pinch
            gesture = {
                type: currentScale > 1 || (gesture?.fingers ?? 1) > 1 ? 'pan' : 'swipe',
                startX: touch.clientX, startY: touch.clientY,
                startTX: translateX, startTY: translateY,
                lastY: touch.clientY, lastTime: performance.now(), velocityY: 0,
                moved: gesture?.moved ?? false,
                startTime: gesture?.startTime ?? performance.now(),
                fingers: gesture?.fingers ?? 1,
            };
        };

        const startPinch = (a, b) => {
            const mid = touchMidpoint(a, b);
            const c = centre();
            gesture = {
                type: 'pinch',
                startDistance: touchDistance(a, b) || 1,
                startScale: currentScale,
                // The image point under the fingers' midpoint, in unscaled image pixels from its centre
                anchorX: (mid.x - c.x - translateX) / currentScale,
                anchorY: (mid.y - c.y - translateY) / currentScale,
                moved: true,
                startTime: gesture?.startTime ?? performance.now(),
                fingers: 2,
            };
        };

        const setBackdropFade = (amount) => {
            lightbox.style.backgroundColor = amount ? `rgba(5, 5, 6, ${0.96 * (1 - amount)})` : '';
        };

        lightbox.addEventListener('touchstart', (e) => {
            if (!lightbox.classList.contains('active') || e.target.closest('.lightbox-close')) return;
            e.preventDefault();
            lightboxImg.style.transition = 'none';
            if (e.touches.length >= 2) {
                setBackdropFade(0);
                startPinch(e.touches[0], e.touches[1]);
            } else {
                gesture = null;
                startPan(e.touches[0]);
            }
            lightbox.classList.add('is-dragging');
        }, { passive: false });

        lightbox.addEventListener('touchmove', (e) => {
            if (!gesture) return;
            e.preventDefault();

            if (gesture.type === 'pinch' && e.touches.length >= 2) {
                const [a, b] = e.touches;
                const mid = touchMidpoint(a, b);
                const c = centre();
                // Let the pinch overshoot a little either way; touchend settles it back in range
                currentScale = Math.min(Math.max(gesture.startScale * touchDistance(a, b) / gesture.startDistance, 0.6), TOUCH_MAX_SCALE * 1.3);
                translateX = mid.x - c.x - gesture.anchorX * currentScale;
                translateY = mid.y - c.y - gesture.anchorY * currentScale;
                applyTransform(false);
                return;
            }

            const touch = e.touches[0];
            const dx = touch.clientX - gesture.startX;
            const dy = touch.clientY - gesture.startY;
            if (Math.hypot(dx, dy) > TAP_SLOP) gesture.moved = true;
            if (!gesture.moved) return;

            if (gesture.type === 'pan') {
                translateX = gesture.startTX + dx;
                translateY = gesture.startTY + dy;
                clampPan();
            } else {
                // Not zoomed: the image follows the finger vertically and the backdrop fades
                const now = performance.now();
                gesture.velocityY = (touch.clientY - gesture.lastY) / Math.max(now - gesture.lastTime, 1);
                gesture.lastY = touch.clientY;
                gesture.lastTime = now;
                translateX = 0;
                translateY = dy;
                setBackdropFade(Math.min(Math.abs(dy) / 400, 0.7));
            }
            applyTransform(false);
        }, { passive: false });

        const endTouch = (e) => {
            if (!gesture) return;
            e.preventDefault();

            // A finger lifted mid-pinch: carry on panning with the one that is left
            if (e.touches.length === 1) {
                if (gesture.type === 'pinch') {
                    currentScale = Math.min(Math.max(currentScale, 1), TOUCH_MAX_SCALE);
                    if (currentScale === 1) resetZoom();
                    clampPan();
                    applyTransform(true);
                    setZoomed();
                }
                startPan(e.touches[0]);
                return;
            }
            if (e.touches.length > 1) {
                startPinch(e.touches[0], e.touches[1]);
                return;
            }

            const ended = gesture;
            const touch = e.changedTouches[0];
            gesture = null;
            lightbox.classList.remove('is-dragging');

            if (ended.type === 'pinch') {
                if (currentScale < 1.05) resetZoom();
                else if (currentScale > TOUCH_MAX_SCALE) zoomTo(TOUCH_MAX_SCALE, touch.clientX, touch.clientY);
                clampPan();
                setZoomed();
                applyTransform(true);
                return;
            }

            if (ended.type === 'swipe' && ended.moved) {
                const dy = touch.clientY - ended.startY;
                if (Math.abs(dy) > 120 || Math.abs(ended.velocityY) > 0.6) {
                    closeLightbox();
                } else {
                    translateY = 0;
                    setBackdropFade(0);
                    applyTransform(true);
                }
                return;
            }

            if (ended.moved || ended.fingers > 1) {
                applyTransform(true);
                return;
            }

            // A tap. Two in quick succession on the image toggle the zoom at that point;
            // one on the backdrop closes.
            const now = performance.now();
            const onImage = e.target === lightboxImg;
            const isDoubleTap = now - lastTap.time < 300 && Math.hypot(touch.clientX - lastTap.x, touch.clientY - lastTap.y) < 30;
            if (onImage && isDoubleTap) {
                if (currentScale > 1) resetZoom();
                else zoomTo(DOUBLE_TAP_SCALE, touch.clientX, touch.clientY);
                clampPan();
                setZoomed();
                applyTransform(true);
                lastTap = { time: 0, x: 0, y: 0 };
            } else if (!onImage && currentScale <= 1) {
                closeLightbox();
            } else {
                lastTap = { time: now, x: touch.clientX, y: touch.clientY };
            }
        };

        lightbox.addEventListener('touchend', endTouch, { passive: false });
        lightbox.addEventListener('touchcancel', endTouch, { passive: false });

        // Safari's own pinch-zoom of the page underneath
        lightbox.addEventListener('gesturestart', (e) => e.preventDefault());

        // Click to Zoom in / Zoom out
        lightboxImg.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isMoved) {
                isMoved = false;
                return;
            }

            if (currentScale > 1) {
                // Smooth Zoom out to fitted view
                currentScale = 1;
                translateX = 0;
                translateY = 0;
                lightbox.classList.remove('is-zoomed');
                applyTransform(true);
            } else {
                // Smooth Zoom in centered directly on clicked coordinates
                const centerX = window.innerWidth / 2;
                const centerY = window.innerHeight / 2;
                const clickOffsetX = e.clientX - centerX;
                const clickOffsetY = e.clientY - centerY;

                currentScale = 2.2;
                translateX = -clickOffsetX * (currentScale - 1);
                translateY = -clickOffsetY * (currentScale - 1);
                clampPan();
                lightbox.classList.add('is-zoomed');
                applyTransform(true);
            }
        });

        // Mouse Wheel to Smooth Zoom
        lightbox.addEventListener('wheel', (e) => {
            if (!lightbox.classList.contains('active')) return;
            e.preventDefault();
            const zoomDelta = e.deltaY < 0 ? 1.2 : 0.8;
            const newScale = Math.min(Math.max(1, currentScale * zoomDelta), 4);
            if (Math.abs(newScale - currentScale) < 0.01) return;

            if (newScale <= 1.05) {
                currentScale = 1;
                translateX = 0;
                translateY = 0;
                lightbox.classList.remove('is-zoomed');
            } else {
                const centerX = window.innerWidth / 2;
                const centerY = window.innerHeight / 2;
                const mouseOffsetX = e.clientX - centerX;
                const mouseOffsetY = e.clientY - centerY;
                const scaleRatio = newScale / currentScale;

                translateX = mouseOffsetX - (mouseOffsetX - translateX) * scaleRatio;
                translateY = mouseOffsetY - (mouseOffsetY - translateY) * scaleRatio;
                currentScale = newScale;
                lightbox.classList.add('is-zoomed');
            }
            clampPan();
            applyTransform(true);
        }, { passive: false });
    }

    // License text, fetched once per file and shared by the pop-up and the credits reader
    const licenseCache = new Map();
    const loadLicense = (file) => {
        if (!licenseCache.has(file)) {
            licenseCache.set(file, fetch(`/assets/licenses/${file}`).then(response => {
                if (!response.ok) throw new Error('Failed to load license');
                return response.text();
            }).catch(error => {
                licenseCache.delete(file);
                throw error;
            }));
        }
        return licenseCache.get(file);
    };
    const licenseError = 'Error loading license text. Please try again later.';

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

    // Credits library browser: selecting a project shows its license in the reader.
    // On phones the list is a horizontal strip above the reader.
    const libraryItems = Array.from(document.querySelectorAll('.library-item'));
    const libraryReader = document.getElementById('library-reader');

    if (libraryItems.length > 0 && libraryReader) {
        const readerName = libraryReader.querySelector('.reader-name');
        const readerStack = libraryReader.querySelector('.reader-stack');
        const readerSpdx = libraryReader.querySelector('.reader-spdx');
        const readerLink = libraryReader.querySelector('.reader-link');
        const readerText = libraryReader.querySelector('.reader-text');
        const libraryList = libraryItems[0].closest('.library-list');
        const stackLabels = { core: 'Core', electron: 'Electron', qt: 'Qt' };
        let readerRequest = 0;

        const showInReader = async (item) => {
            libraryItems.forEach(other => {
                const isActive = other === item;
                other.classList.toggle('active', isActive);
                other.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });

            // Keep the selected project in view inside the list: centred in the phone strip,
            // scrolled into view in the desktop column (the page itself never scrolls)
            if (libraryList) {
                const listRect = libraryList.getBoundingClientRect();
                const itemRect = item.getBoundingClientRect();
                if (libraryList.scrollWidth > libraryList.clientWidth) {
                    libraryList.scrollBy({
                        left: itemRect.left - listRect.left - (listRect.width - itemRect.width) / 2,
                        behavior: 'smooth'
                    });
                } else if (itemRect.top < listRect.top || itemRect.bottom > listRect.bottom) {
                    libraryList.scrollBy({
                        top: itemRect.top - listRect.top - (listRect.height - itemRect.height) / 2,
                        behavior: 'smooth'
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
            item.addEventListener('click', () => showInReader(item));
        });

        showInReader(libraryItems.find(item => item.classList.contains('active')) || libraryItems[0]);
    }

    // Setup Page Scenario Selector (Single PC vs Dual System)
    const scenarioSingleBtn = document.getElementById('scenarioSingleBtn');
    const scenarioDualBtn = document.getElementById('scenarioDualBtn');
    const scenarioSinglePane = document.getElementById('scenarioSinglePane');
    const scenarioDualPane = document.getElementById('scenarioDualPane');

    if (scenarioSingleBtn && scenarioDualBtn && scenarioSinglePane && scenarioDualPane) {
        scenarioSingleBtn.addEventListener('click', () => {
            scenarioSingleBtn.classList.add('active');
            scenarioSingleBtn.setAttribute('aria-selected', 'true');
            scenarioDualBtn.classList.remove('active');
            scenarioDualBtn.setAttribute('aria-selected', 'false');
            scenarioSinglePane.classList.add('active');
            scenarioDualPane.classList.remove('active');
        });

        scenarioDualBtn.addEventListener('click', () => {
            scenarioDualBtn.classList.add('active');
            scenarioDualBtn.setAttribute('aria-selected', 'true');
            scenarioSingleBtn.classList.remove('active');
            scenarioSingleBtn.setAttribute('aria-selected', 'false');
            scenarioDualPane.classList.add('active');
            scenarioSinglePane.classList.remove('active');
        });
    }

    // Setup Page Platform Tabs (Windows vs macOS vs Linux)
    const platformTabButtons = document.querySelectorAll('.platform-tab-btn');
    const platformPanes = document.querySelectorAll('.platform-pane');

    if (platformTabButtons.length > 0 && platformPanes.length > 0) {
        platformTabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetPaneId = btn.getAttribute('aria-controls');
                if (!targetPaneId) return;

                platformTabButtons.forEach(b => {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                });
                platformPanes.forEach(p => {
                    p.classList.remove('active');
                });

                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                const targetPane = document.getElementById(targetPaneId);
                if (targetPane) targetPane.classList.add('active');
            });
        });
    }

    // Copy to Clipboard Action Buttons
    const copyButtons = document.querySelectorAll('.copy-action-btn[data-copy]');
    copyButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const textToCopy = btn.getAttribute('data-copy');
            if (!textToCopy) return;

            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(textToCopy);
                } else {
                    const textArea = document.createElement('textarea');
                    textArea.value = textToCopy;
                    textArea.style.position = 'fixed';
                    textArea.style.opacity = '0';
                    document.body.appendChild(textArea);
                    textArea.focus();
                    textArea.select();
                    document.execCommand('copy');
                    textArea.remove();
                }

                const span = btn.querySelector('span');
                const origText = span ? span.textContent : 'Copy';
                btn.classList.add('copied');
                if (span) span.textContent = 'Copied!';

                setTimeout(() => {
                    btn.classList.remove('copied');
                    if (span) span.textContent = origText;
                }, 2000);
            } catch (err) {
                console.error('Failed to copy text: ', err);
            }
        });
    });

    // Download modal: its markup lives in partials/download-modal.html and is built into every page
    // with links marked data-download (scripts/partials.mjs). Each trigger is a real link to the
    // release, so without the modal (or without JavaScript) a click simply opens GitHub.
    const downloadTriggers = document.querySelectorAll('[data-download]');

    const setupDownloadModal = (downloadModal) => {
        const closeDownloadModal = downloadModal.querySelector('#closeDownloadModal');
        const downloadOsTabs = downloadModal.querySelectorAll('.download-os-tab');
        let lastTrigger = null;

        // The "What to choose" callout points at the comparison page; drop it when already there
        const chooseLink = downloadModal.querySelector('.download-choose a');
        if (chooseLink && normalisePath(new URL(chooseLink.href).pathname) === currentPath) {
            downloadModal.querySelector('.download-choose').remove();
        }

        // Detect the user's OS
        const detectOS = () => {
            const ua = navigator.userAgent || navigator.platform || '';
            if (/Mac|iPhone|iPad|iPod/.test(ua) && !ua.includes('Windows')) return 'macos';
            if (/Linux/.test(ua) && !/Android/.test(ua)) return 'linux';
            if (/Windows/.test(ua)) return 'windows';
            return null;
        };

        const detectedOS = detectOS();
        const osLabels = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

        const switchOsTab = (os) => {
            downloadOsTabs.forEach(tab => {
                const isActive = tab.dataset.os === os;
                tab.classList.toggle('active', isActive);
                tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
                tab.tabIndex = isActive ? 0 : -1;
            });
            // CSS shows only the links and file types marked data-os-only for this platform
            downloadModal.dataset.os = os;
        };

        // The build links ship without an href (see partials/download-modal.html) and get one on first open
        const fillBuildLinks = () => {
            downloadModal.querySelectorAll('a[data-build]:not([href])').forEach(link => {
                link.href = `/download/${link.dataset.build}`;
                link.rel = 'nofollow';
            });
        };

        const openDownloadModal = (trigger) => {
            lastTrigger = trigger;
            fillBuildLinks();
            // Counted by worker/index.js; the downloads themselves are counted by their /download/ redirects
            navigator.sendBeacon?.(`/api/event?name=download_modal_open&os=${detectedOS || ''}`);
            // Unsupported platforms (phones, tablets, ...) fall back to the Windows builds
            switchOsTab(detectedOS || 'windows');

            const noteEl = downloadModal.querySelector('#downloadDetectedNote');
            if (noteEl) noteEl.textContent = detectedOS
                ? `${osLabels[detectedOS]} detected`
                : 'Desktop only';

            downloadModal.classList.add('active');
            document.documentElement.classList.add('modal-open');
            document.body.classList.add('modal-open');
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';

            closeDownloadModal?.focus();
        };

        const closeDownloadModalFn = () => {
            downloadModal.classList.remove('active');
            document.documentElement.classList.remove('modal-open');
            document.body.classList.remove('modal-open');
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            lastTrigger?.focus();
        };

        closeDownloadModal?.addEventListener('click', closeDownloadModalFn);

        downloadModal.addEventListener('click', (e) => {
            if (e.target === downloadModal) closeDownloadModalFn();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && downloadModal.classList.contains('active')) {
                closeDownloadModalFn();
            }
        });

        // OS tab switching
        downloadOsTabs.forEach(tab => {
            tab.addEventListener('click', () => switchOsTab(tab.dataset.os));

            tab.addEventListener('keydown', (e) => {
                const tabs = Array.from(downloadOsTabs);
                const idx = tabs.indexOf(tab);
                let target = null;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = (idx + 1) % tabs.length;
                else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = (idx - 1 + tabs.length) % tabs.length;
                else if (e.key === 'Home') target = 0;
                else if (e.key === 'End') target = tabs.length - 1;
                if (target !== null) {
                    e.preventDefault();
                    switchOsTab(tabs[target].dataset.os);
                    tabs[target].focus();
                }
            });
        });

        return openDownloadModal;
    };

    const downloadModal = document.getElementById('downloadModal');
    if (downloadModal && downloadTriggers.length > 0) {
        const openDownloadModal = setupDownloadModal(downloadModal);

        downloadTriggers.forEach(trigger => {
            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                openDownloadModal(trigger);
            });
        });
    }
});
