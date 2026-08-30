import { Cadence } from './models';

// Turns one free-text sentence ("24 books", "£5,000", "3 runs a week")
// into a tracking shape, for the "What are you aiming for?" field in a
// milestone's drill-in. Pure and synchronous — never throws, never blocks
// on anything. Any input it can't make sense of degrades to `{ kind:
// 'check' }` rather than erroring or guessing something specific and
// possibly wrong; a checkbox is always a safe, correctable default.
//
// Deliberately does NOT infer a build-up (start/end/week-count) — no
// single sentence in the examples this was designed against maps to that
// shape, and guessing one from a phrase like "24 books" would be
// inventing structure nobody asked for. Build-up stays reachable only
// through the manual "Change this" controls or the coach.
//
// Deliberately does NOT attempt any "is this a reasonable number" check.
// "240000000 books" parses to target 240000000 at face value — a
// visibly-wrong number the user can see and fix beats a value silently
// clamped to something that merely looks plausible but isn't what was
// typed.
export type ParsedTracking =
  | { kind: 'number'; target: number; unit: string; step: number }
  | { kind: 'commitment'; cadence: Cadence; intervalDays?: number }
  | { kind: 'check' };

// One..ten plus "once"/"twice" — the only word-numbers asked for. Checked
// wherever a digit-number is checked, not just for frequency phrases, so
// "three books" (if anyone types it) resolves the same way "3 books"
// would rather than falling to checkbox for no real reason.
const WORD_NUMBERS: Record<string, number> = {
  once: 1, twice: 2,
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

// Words that end a unit capture rather than being folded into it — "save
// 5000 dollars by December" must not render a stepper labelled "dollars
// by December". Deliberately the exact list asked for, not a broader
// stopword list — this only needs to stop capture from running past the
// number's actual noun, not parse general English.
const UNIT_STOPWORDS = new Set(['by', 'in', 'before', 'this', 'per', 'a']);

// A bare 4-digit 19xx/20xx number with nothing after it reads as a year
// ("by 2027"), not a target — but ONLY when nothing follows it. "read
// 2000 pages" has a real unit right after the number and must not be
// swallowed by this guard just because 2000 also looks like a year.
function looksLikeYear(digits: string): boolean {
  return /^(19|20)\d{2}$/.test(digits);
}

// Captures up to two words after a number as its unit, stopping at the
// first stopword or the second word, whichever comes first. Returns ''
// (not undefined) when nothing usable follows, so callers can tell "no
// unit" apart from "a unit was captured".
function captureUnit(wordsAfter: string[]): string {
  const kept: string[] = [];
  for (const w of wordsAfter) {
    const clean = w.replace(/[.,!?;:]+$/, '');
    if (!clean) continue;
    if (UNIT_STOPWORDS.has(clean.toLowerCase())) break;
    kept.push(clean);
    if (kept.length === 2) break;
  }
  return kept.join(' ');
}

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

// ── Step 1: frequency / cadence ─────────────────────────────────────
//
// Checked before anything else — "3 runs a week" contains both a number
// and a frequency, and the frequency is what actually determines the
// tracking shape (a Commitment, not a Number). Any leading count is
// deliberately DISCARDED here (see the module comment on Commitment.amount
// in the caller) rather than carried through as a per-period amount the
// app can't actually honour — a single weekly check-off doesn't mean "3
// runs happened", so showing "3" would be a plausible-looking lie, the
// same class of problem the ramp-compression fix ruled out. This parses
// to a plain habit on whatever cadence was named; nothing else.
function detectFrequency(text: string): { cadence: Cadence; intervalDays?: number } | null {
  const lower = text.toLowerCase();
  const everyNDays = lower.match(/\bevery\s+(\d+)\s+days?\b/);
  if (everyNDays) {
    const n = parseInt(everyNDays[1], 10);
    if (n > 0) return { cadence: 'custom', intervalDays: n };
  }
  if (/\b(daily|every day|per day|a day|each day)\b/.test(lower)) {
    return { cadence: 'custom', intervalDays: 1 };
  }
  if (/\b(monthly|per month|a month|\/month)\b/.test(lower)) {
    return { cadence: 'monthly' };
  }
  if (/\b(weekly|per week|a week|\/week)\b/.test(lower)) {
    return { cadence: 'weekly' };
  }
  return null;
}

// ── Step 2: currency ─────────────────────────────────────────────────
const CURRENCY_SYMBOLS = ['£', '$', '€', '¥'];
function detectCurrency(text: string): { value: number; symbol: string } | null {
  for (const sym of CURRENCY_SYMBOLS) {
    const escaped = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const before = new RegExp(`${escaped}\\s*([\\d,]+(?:\\.\\d+)?)`);
    const after = new RegExp(`([\\d,]+(?:\\.\\d+)?)\\s*${escaped}`);
    const m = text.match(before) ?? text.match(after);
    if (m) {
      const value = parseFloat(m[1].replace(/,/g, ''));
      if (Number.isFinite(value) && value > 0) return { value, symbol: sym };
    }
  }
  return null;
}

// ── Step 3: plain number (digit or word) + trailing noun ─────────────
function detectPlainNumber(text: string): { value: number; unit: string } | null {
  const words = tokenize(text);

  for (let i = 0; i < words.length; i++) {
    const raw = words[i].replace(/[.,!?;:]+$/, '');
    const digitMatch = raw.match(/^[\d,]+(?:\.\d+)?$/);
    const isDigit = !!digitMatch;
    const wordValue = WORD_NUMBERS[raw.toLowerCase()];
    if (!isDigit && wordValue == null) continue;

    const value = isDigit ? parseFloat(raw.replace(/,/g, '')) : wordValue;
    if (!Number.isFinite(value) || value <= 0) continue;

    const unit = captureUnit(words.slice(i + 1));

    // Year guard — only when this number has no unit trailing it. A
    // 4-digit 19xx/20xx figure immediately followed by a real word
    // ("2000 pages") is a target; one with nothing after it ("by 2027")
    // almost certainly isn't.
    if (isDigit && !unit && looksLikeYear(raw)) continue;

    return { value, unit };
  }
  return null;
}

// Rounds a target to a "nice" step — the same 1/2/5-per-decade scheme a
// chart's axis ticks use — instead of defaulting every number goal to a
// step of 1, which is unusable for anything past a couple hundred (a
// £5,000 goal ticking up by 1 would take 5,000 taps).
function stepForMagnitude(target: number): number {
  if (target <= 50) return 1;
  if (target <= 500) return 5;
  if (target <= 5000) return 50;
  if (target <= 50000) return 100;
  if (target <= 500000) return 1000;
  const scaled = target / 500;
  const magnitude = Math.pow(10, Math.floor(Math.log10(scaled)));
  const norm = scaled / magnitude;
  const nice = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return nice * magnitude;
}

export function parseTrackingInput(raw: string): ParsedTracking {
  try {
    const text = (raw ?? '').trim();
    if (!text) return { kind: 'check' };

    const freq = detectFrequency(text);
    if (freq) return { kind: 'commitment', ...freq };

    const currency = detectCurrency(text);
    if (currency) {
      return { kind: 'number', target: currency.value, unit: currency.symbol, step: stepForMagnitude(currency.value) };
    }

    const plain = detectPlainNumber(text);
    if (plain) {
      return { kind: 'number', target: plain.value, unit: plain.unit, step: stepForMagnitude(plain.value) };
    }

    return { kind: 'check' };
  } catch {
    // Never fail loudly — any unexpected input just reads as "no number
    // found", the same as deliberate nonsense.
    return { kind: 'check' };
  }
}
