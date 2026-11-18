import { QUESTIONS, LAUNCH_OSES, derive, matches, fillsFor } from '../data/setup-logic';
import { pad } from '../data/format';
import './copy.js';
import './tabs.js';

// Setup Page questionnaire. Each answer is a radio group in #setupQuiz; data/setup-logic.ts turns the answers into
// the blocks that show (data-when) and the text that fills in (data-fill). The answers live in the page's query
// string, so a setup can be linked to and survives a reload.
const quiz = document.getElementById('setupQuiz');
const result = document.getElementById('setupResult');

const answers = () => Object.fromEntries(QUESTIONS.map(name => [name, quiz.elements[name]?.value || undefined]));

let wasComplete = false;

// Pre-race checklist: tick items off, open "How" under any of them. The count only takes in the items this setup
// shows, so it follows the answers.
const checklist = document.querySelector('[data-checklist]');
const updateChecklist = () => {
    if (!checklist) return;
    const items = Array.from(checklist.querySelectorAll('[data-check-item]')).filter(item => !item.closest('[hidden]'));
    const done = items.filter(item => item.classList.contains('done')).length;
    checklist.querySelector('[data-check-count]').textContent = `${done} of ${items.length}`;
    checklist.querySelector('[data-check-bar]').style.width = items.length ? `${(done / items.length) * 100}%` : '0';
};
checklist?.addEventListener('click', e => {
    const tick = e.target.closest('[data-check-tick]');
    if (tick) {
        const on = tick.getAttribute('aria-checked') !== 'true';
        tick.setAttribute('aria-checked', String(on));
        tick.closest('[data-check-item]').classList.toggle('done', on);
        updateChecklist();
        return;
    }
    const how = e.target.closest('[data-check-how]');
    if (how) {
        const body = document.getElementById(how.getAttribute('aria-controls'));
        const open = how.getAttribute('aria-expanded') !== 'true';
        how.setAttribute('aria-expanded', String(open));
        how.textContent = open ? 'Hide' : 'How';
        body.hidden = !open;
    }
});

// ?os_instructions=<os>, from the Download page's cards: that OS's first-launch steps show above the questions
// until the result does, and the OS question starts on it
const params = new URLSearchParams(location.search);
let osInstructions = LAUNCH_OSES.includes(params.get('os_instructions')) ? params.get('os_instructions') : null;

const render = () => {
    const state = derive(answers(), osInstructions);

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

    updateChecklist();

    // Troubleshooting links open with this setup's computer (or Android) already picked
    const forOs = state.link === 'direct' ? 'android' : state.os;
    document.querySelectorAll('[data-fix-link]').forEach(link => {
        const url = new URL(link.getAttribute('href'), location.href);
        if (forOs) url.searchParams.set('for', forOs); else url.searchParams.delete('for');
        link.setAttribute('href', url.pathname + url.search + url.hash);
    });

    // Remember the answers in the address bar (only the ones that apply)
    const params = new URLSearchParams();
    QUESTIONS.forEach(name => { if (state[name]) params.set(name, state[name]); });
    if (state.launch) params.set('os_instructions', state.launch);
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
    osInstructions = null;
    render();
    quiz.querySelector('input')?.focus({ preventScroll: true });
    quiz.scrollIntoView({ block: 'start' });
});

// Restore answers from the URL. An os answer of its own wins over os_instructions.
QUESTIONS.forEach(name => {
    const value = params.get(name) ?? (name === 'os' ? osInstructions : null);
    const input = quiz.querySelector(`input[name="${name}"][value="${CSS.escape(value ?? '')}"]`);
    if (input) input.checked = true;
});
render();
