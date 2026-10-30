// Helpers for the single-player AI judge (/battle/judge)

export const RUBRIC = ['rhyme', 'flow', 'insults', 'creativity'];
const RUBRIC_MIN = 0;
const RUBRIC_MAX = 10;

// Strip angle brackets so a verse can't close or open the prompt's <user_verse> / <ai_verse> tags
export const sanitizeVerse = (text) => String(text ?? '').replace(/[<>]/g, '');

const tokenize = (text) => String(text ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];

// Word bonus is decided here, not by the model: the mandatory word (or phrase) must appear
// as whole words in a line that has at least 3 other words
export const earnsWordBonus = (verse, word) => {
    if (!word || word === 'NONE') return false;
    const target = tokenize(word);
    if (target.length === 0) return false;

    return String(verse ?? '').split(/\r?\n/).some(line => {
        const tokens = tokenize(line);
        if (tokens.length - target.length < 3) return false;
        for (let i = 0; i + target.length <= tokens.length; i++) {
            if (target.every((t, j) => tokens[i + j] === t)) return true;
        }
        return false;
    });
};

const clampScore = (value) => {
    if (typeof value === 'string' && value.trim() !== '') value = Number(value);
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    return Math.min(RUBRIC_MAX, Math.max(RUBRIC_MIN, value));
};

const parseSide = (side) => {
    if (!side || typeof side !== 'object') return null;
    const scores = {};
    for (const key of RUBRIC) {
        const score = clampScore(side[key]);
        if (score === null) return null;
        scores[key] = score;
    }
    return scores;
};

// Returns { user, ai, comment } with every rubric score clamped to 0-10,
// or null if the reply has no JSON object or any rubric score is missing / not a number
export const parseJudgeScores = (responseText) => {
    const text = String(responseText ?? '');
    const startIndex = text.indexOf('{');
    const endIndex = text.lastIndexOf('}');
    if (startIndex === -1 || endIndex <= startIndex) return null;

    const cleanedJson = text.substring(startIndex, endIndex + 1)
        .replace(/,\s*}/g, '}')  // Remove trailing commas
        .replace(/,\s*\]/g, ']'); // Remove trailing array commas

    let parsed;
    try { parsed = JSON.parse(cleanedJson); }
    catch (e) { return null; }

    const user = parseSide(parsed.user);
    const ai = parseSide(parsed.ai);
    if (!user || !ai) return null;

    return { user, ai, comment: typeof parsed.comment === 'string' ? parsed.comment : '' };
};
