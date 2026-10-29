import { QUESTIONS, derive, matches, fillsFor } from '../data/setup-logic';
import { pad } from '../data/format';

// Setup Page questionnaire. Each answer is a radio group in #setupQuiz; data/setup-logic.ts turns the answers into
// the blocks that show (data-when) and the text that fills in (data-fill). The answers live in the page's query
// string, so a setup can be linked to and survives a reload.
const quiz = document.getElementById('setupQuiz');
const result = document.getElementById('setupResult');

const answers = () => Object.fromEntries(QUESTIONS.map(name => [name, quiz.elements[name]?.value || undefined]));

let wasComplete = false;

const render = () => {
    const state = derive(answers());

    document.querySelectorAll('[data-when]').forEach(el => {
        el.hidden = !matches(el.dataset.when, state);
    });

    const fills = fillsFor(state);
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
        fieldset.querySelector('.quiz-num').textContent = pad(q);
    });
    let n = 0;
    result.querySelectorAll('.result-step').forEach(step => {
        if (step.hidden) return;
        n += 1;
        step.querySelector('.setup-step-badge').textContent = pad(n);
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
