// Lightbox Logic & Fluid GPU Zoom & Pan Algorithm
import { setupDialog } from './dialog.js';

const lightbox = document.getElementById('lightbox');
const lightboxImg = lightbox?.querySelector('img');
const lightboxClose = document.getElementById('lightboxClose');
const zoomButtons = document.querySelectorAll('.zoom-btn');

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
    let lastTrigger = null;

    // Runs once the dialog has closed (button, Esc, backdrop or swipe): reset for next time, focus back to the screenshot
    const lightboxDialog = setupDialog(lightbox, {
        onClose: () => {
            lightboxLoadId++;
            lightbox.style.backgroundColor = '';
            lightbox.classList.remove('is-zoomed', 'is-dragging');
            currentScale = 1;
            translateX = 0;
            translateY = 0;
            applyTransform(false);
            lastTrigger?.focus();
        }
    });

    const openLightbox = (src, previewSrc, alt) => {
        // Show the already-loaded card image instantly so the previous image never flashes,
        // then swap in the full-size file once it has downloaded and decoded.
        const loadId = ++lightboxLoadId;
        lightboxImg.src = previewSrc || src;
        lightboxImg.alt = alt;
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
        lightboxDialog.open();
        lightboxClose?.focus();
    };

    const closeLightbox = lightboxDialog.close;

    zoomButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // The screenshot the button sits on; the Gallery holds both frontends' and hides one
            const img = Array.from(btn.parentElement.querySelectorAll('.mockup-img'))
                .find(el => el.getClientRects().length > 0);
            if (img && img.src) {
                lastTrigger = btn;
                // Open the lossless full-size PNG that sits next to every screenshot's WebP
                // (e.g. overview.webp -> overview.png); the compressed card image shows meanwhile.
                const fullPng = img.src.replace(/\.[a-z0-9]+(?=$|[?#])/i, '.png');
                openLightbox(fullPng, img.currentSrc || img.src, img.alt);
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

    // Keyboard: + and - zoom on the centre, 0 resets, the arrow keys pan while zoomed (Esc is the dialog's)
    const KEY_PAN = 80;
    lightbox.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const c = centre();
        if (e.key === '+' || e.key === '=') {
            zoomTo(Math.min(currentScale * 1.5, TOUCH_MAX_SCALE), c.x, c.y);
        } else if (e.key === '-' || e.key === '_') {
            const scale = currentScale / 1.5;
            if (scale <= 1.05) resetZoom();
            else zoomTo(scale, c.x, c.y);
        } else if (e.key === '0') {
            resetZoom();
        } else if (currentScale > 1 && e.key.startsWith('Arrow')) {
            const [dx, dy] = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key] || [0, 0];
            translateX += dx * KEY_PAN;
            translateY += dy * KEY_PAN;
        } else {
            return;
        }
        e.preventDefault();
        clampPan();
        setZoomed();
        applyTransform(true);
    });
}
