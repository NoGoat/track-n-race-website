// Setup Page questionnaire. Each answer is a radio group in #setupQuiz; the answers, and what they add up to
// (derive below), decide which blocks show. A block's data-when lists the conditions it needs, all of them:
// "view=computer,both platform=pc" shows when view is computer or both and platform is pc; "game=*" when game is
// answered. data-fill elements take their text from the answers. The answers live in the page's query string, so a
// setup can be linked to and survives a reload.
const quiz = document.getElementById('setupQuiz');
const result = document.getElementById('setupResult');
const QUESTIONS = ['platform', 'game', 'view', 'host', 'os'];

const GAME_NAMES = { f124: 'F1 24', f125: 'F1 25', f126: 'F1 25 + 2026 Season Pack' };
const FORMATS = { f124: '2024', f125: '2025', f126: '2026' };
const PLATFORM_NAMES = { pc: 'PC', console: 'console' };
const OS_NAMES = { windows: 'your Windows PC', macos: 'your Mac', linux: 'your Linux PC' };
// The device the game sends to, as the IP step names it
const IP_DEVICES = { windows: 'your Windows PC', macos: 'your Mac', linux: 'your Linux PC', android: 'your phone' };
const IP_OWNERS = { windows: "your PC's", macos: "your Mac's", linux: "your PC's", android: "your phone's" };
// What the game's IP field shows until a real address is entered
const IP_PLACEHOLDERS = { windows: "Your PC's IP", macos: "Your Mac's IP", linux: "Your PC's IP", android: "Your phone's IP" };

const answers = () => Object.fromEntries(QUESTIONS.map(name => [name, quiz.elements[name]?.value || undefined]));

// Answers plus what follows from them. Questions that don't apply are dropped, so a stale answer (say the PC host
// kept after switching to PlayStation) never shows through.
const derive = (a) => {
    const s = { platform: a.platform, game: a.game, view: a.view };
    if (!s.platform || !s.game || !s.view) return s;
    if (s.view !== 'android') {
        // A console can't run Track N Race, so it always sends to another computer
        s.host = s.platform === 'pc' ? a.host : 'other';
        s.os = a.os;
        if (!s.host || !s.os) return s;
    }
    s.link = { computer: 'desktop', android: 'direct', both: 'paired' }[s.view];
    // The Native (Qt) app is built for Windows and Linux only; a Mac runs the Electron app
    if (s.view !== 'android') s.native = s.os === 'macos' ? 'no' : 'yes';
    s.ip = s.view === 'android' ? 'android' : s.host === 'same' ? 'loopback' : s.os;
    s.complete = 'yes';
    return s;
};

const matches = (when, state) => when.trim().split(/\s+/).every(cond => {
    const [key, values] = cond.split('=');
    const value = state[key];
    return value !== undefined && (values === '*' || values.split(',').includes(value));
});

let wasComplete = false;

const render = () => {
    const state = derive(answers());

    document.querySelectorAll('[data-when]').forEach(el => {
        el.hidden = !matches(el.dataset.when, state);
    });

    const fills = {
        'game-name': GAME_NAMES[state.game] ?? 'the game',
        'platform-name': PLATFORM_NAMES[state.platform] ?? 'your device',
        'format': FORMATS[state.game] ?? '',
        'host-name': state.host === 'same' ? (state.os === 'macos' ? 'this Mac' : 'this PC') : OS_NAMES[state.os] ?? 'your computer',
        'ip-device': IP_DEVICES[state.ip] ?? 'the device',
        'ip-owner': IP_OWNERS[state.ip] ?? 'its',
        'ip-target': state.ip === 'loopback' ? '127.0.0.1' : IP_PLACEHOLDERS[state.ip] ?? '',
    };
    document.querySelectorAll('[data-fill]').forEach(el => {
        el.textContent = fills[el.dataset.fill] ?? '';
    });
    // Green only for a literal address; otherwise it describes what goes there
    document.getElementById('ipPill')?.classList.toggle('green', state.ip === 'loopback');

    // Number the questions and steps that apply
    let q = 0;
    quiz.querySelectorAll('.quiz-question').forEach(fieldset => {
        if (fieldset.hidden) return;
        q += 1;
        fieldset.querySelector('.quiz-num').textContent = String(q).padStart(2, '0');
    });
    let n = 0;
    result.querySelectorAll('.result-step').forEach(step => {
        if (step.hidden) return;
        n += 1;
        step.querySelector('.setup-step-badge').textContent = String(n).padStart(2, '0');
    });
    // "step 02" in the text follows the numbering: data-step-ref names the step's data-step
    result.querySelectorAll('[data-step-ref]').forEach(ref => {
        const badge = result.querySelector(`.result-step[data-step="${ref.dataset.stepRef}"] .setup-step-badge`);
        if (badge) ref.textContent = badge.textContent;
    });

    // Remember the answers in the address bar (only the ones that apply)
    const params = new URLSearchParams();
    QUESTIONS.forEach(name => { if (state[name]) params.set(name, state[name]); });
    const query = params.toString();
    history.replaceState(null, '', query ? `?${query}` : location.pathname);
    document.getElementById('copySetupLink')?.setAttribute('data-copy', location.href);

    const complete = state.complete === 'yes';
    const justCompleted = complete && !wasComplete;
    wasComplete = complete;
    return justCompleted;
};

// Answering the last question scrolls the result into view (but not on load, when the answers come from the URL)
quiz.addEventListener('change', () => {
    if (render()) {
        const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
        result.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        result.focus({ preventScroll: true });
    }
});

// Buttons that set an answer, like "computer and Android" in the Direct mode result. The page then moves to the
// next question that still needs an answer, or back to the result.
document.querySelectorAll('[data-answer]').forEach(btn => {
    btn.addEventListener('click', () => {
        const [name, value] = btn.dataset.answer.split('=');
        const input = quiz.querySelector(`input[name="${name}"][value="${value}"]`);
        if (!input) return;
        input.checked = true;
        render();
        const next = Array.from(quiz.querySelectorAll('fieldset:not([hidden])'))
            .find(fieldset => !fieldset.querySelector('input:checked'));
        (next ?? result).scrollIntoView({ block: 'start' });
        (next?.querySelector('input') ?? result).focus({ preventScroll: true });
    });
});

document.getElementById('resetSetup')?.addEventListener('click', () => {
    quiz.reset();
    render();
    quiz.querySelector('input')?.focus({ preventScroll: true });
    quiz.scrollIntoView({ block: 'start' });
});

// Restore answers from the URL
const params = new URLSearchParams(location.search);
QUESTIONS.forEach(name => {
    const input = quiz.querySelector(`input[name="${name}"][value="${CSS.escape(params.get(name) ?? '')}"]`);
    if (input) input.checked = true;
});
render();

// Copy to Clipboard Action Buttons
// The result is announced through #copyStatus, a visually hidden live region
const copyButtons = document.querySelectorAll('.copy-action-btn[data-copy]');
const copyStatus = document.getElementById('copyStatus');
const announce = (message) => {
    if (!copyStatus) return;
    // Cleared first, so the same message twice in a row is still read out
    copyStatus.textContent = '';
    setTimeout(() => { copyStatus.textContent = message; }, 50);
};

// The button's label says what happened for two seconds
const flash = (btn, text) => {
    const span = btn.querySelector('.copy-label');
    if (!span) return;
    clearTimeout(btn.flashTimer);
    span.textContent = text;
    btn.classList.toggle('copied', text === 'Copied!');
    btn.flashTimer = setTimeout(() => {
        btn.classList.remove('copied');
        span.textContent = btn.dataset.label ?? 'Copy';
    }, 2000);
};

copyButtons.forEach(btn => {
    btn.dataset.label = btn.querySelector('.copy-label')?.textContent ?? 'Copy';
    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const textToCopy = btn.getAttribute('data-copy');
        if (!textToCopy) return;
        // The setup link is announced by what it is, not the whole URL
        const what = btn.id === 'copySetupLink' ? 'a link to this setup' : textToCopy;

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
                btn.focus(); // the textarea took focus; give it back
            }

            flash(btn, 'Copied!');
            announce(`Copied ${what} to the clipboard`);
        } catch (err) {
            flash(btn, 'Failed');
            announce(`Couldn't copy ${what}`);
            console.error('Failed to copy text: ', err);
        }
    });
});
