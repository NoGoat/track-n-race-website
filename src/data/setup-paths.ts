// The Setup page without JavaScript (pages/no-js/setup/) is a page per set of answers: each answer is a link to the
// page for the answers so far plus that one. The answers are the path, in question order, by value:
// /no-js/setup/pc/f125/computer/same/windows/. Every value is unique across the questions, so the path reads back.
import { questions } from './setup';
import { derive, matches, type Answers } from './setup-logic';

type Question = (typeof questions)[number];

const applies = (q: Question, a: Answers) => !q.when || matches(q.when, derive(a));

// Only the answers to questions that apply, so switching from PC to PlayStation drops the PC's host
export const canonical = (a: Answers): Answers => {
    const kept: Answers = {};
    questions.forEach(q => {
        const value = a[q.name as keyof Answers];
        if (value && applies(q, kept)) kept[q.name as keyof Answers] = value;
    });
    return kept;
};

// The questions to show: those that apply, up to and including the first one not answered yet
export const shownQuestions = (a: Answers) => {
    const shown: Question[] = [];
    for (const q of questions) {
        if (!applies(q, a)) continue;
        shown.push(q);
        if (!a[q.name as keyof Answers]) break;
    }
    return shown;
};

const nextQuestion = (a: Answers) => questions.find(q => applies(q, a) && !a[q.name as keyof Answers]);

export const pathOf = (a: Answers) => questions.map(q => a[q.name as keyof Answers]).filter(Boolean).join('/');

export const fromPath = (path: string | undefined): Answers => {
    const a: Answers = {};
    (path ?? '').split('/').filter(Boolean).forEach(value => {
        const q = questions.find(q => q.options.some(o => o.value === value));
        if (q) a[q.name as keyof Answers] = value;
    });
    return a;
};

// The page for these answers plus one more, scrolled to the next question or, once all are answered, the result
export const hrefWith = (a: Answers, name: string, value: string) => {
    const next = canonical({ ...a, [name]: value });
    const path = pathOf(next);
    const then = nextQuestion(next);
    return `/no-js/setup/${path ? path + '/' : ''}#${then ? `q-${then.name}` : 'setupResult'}`;
};

// Every set of answers a visitor can reach, from none to every complete setup
export const allAnswerSets = (): Answers[] => {
    const sets: Answers[] = [];
    const walk = (a: Answers) => {
        sets.push(a);
        const q = nextQuestion(a);
        q?.options.forEach(o => walk(canonical({ ...a, [q.name]: o.value })));
    };
    walk({});
    return sets;
};
