/**
 * Content types.
 *
 * An item's payload is *structured*: it says what the question means (a predicate,
 * a claim, a value to compute), not just how it reads. The checker in check.ts
 * evaluates that structure by brute force, so a learner's answer is never graded
 * against the generator's own key. The key is stored only so the content audit
 * (content.test.ts) can confirm the generator and the checker agree.
 */

export type BoardKind = 'sort' | 'construct' | 'refute' | 'choice' | 'numeric' | 'factor' | 'rail';

/** A property of a single whole number. Evaluated with BigInt arithmetic. */
export type NumPredicate =
  | { op: 'div'; d: number }
  | { op: 'rem'; d: number; r: number }
  | { op: 'prime' }
  | { op: 'square' }
  | { op: 'nDivisors'; k: number }
  | { op: 'not'; p: NumPredicate }
  | { op: 'and'; ps: NumPredicate[] }
  | { op: 'or'; ps: NumPredicate[] };

/** An arithmetic expression over the claim's variables a (and b). */
export type Expr =
  | { op: 'var'; v: 'a' | 'b' }
  | { op: 'const'; c: number }
  | { op: 'add' | 'sub' | 'mul'; l: Expr; r: Expr }
  | { op: 'sq'; e: Expr };

export interface Cond {
  expr: Expr;
  pred: NumPredicate;
}

/**
 * "For every a (and b) in the domain: if all `given` hold, then all `then` hold."
 * A claim is true when brute force over the domain finds no counterexample.
 */
export interface Claim {
  vars: 1 | 2;
  given: Cond[];
  then: Cond[];
  domain: [number, number];
}

/** A value the learner computes. Each op has a brute-force evaluator in evaluate.ts. */
export type ValueSpec =
  | { op: 'remainder'; n: string; d: number }
  | { op: 'powMod'; base: number; exp: number; d: number }
  | { op: 'productOfPowersMod'; terms: [number, number][]; d: number }
  | { op: 'factorCount'; n: number }
  | { op: 'gcd'; a: number; b: number }
  | { op: 'lcm'; a: number; b: number }
  | { op: 'largestPrimeFactor'; n: number }
  | { op: 'smallestPrimeFactor'; n: number }
  | { op: 'distinctPrimeCount'; n: number }
  | { op: 'distinctPrimeSum'; n: number }
  | { op: 'trailingZeros'; n: string }
  | { op: 'smallestMultiplierToPower'; n: number; power: 2 | 3 }
  | { op: 'smallest'; p: NumPredicate; from: number; to: number }
  | { op: 'count'; p: NumPredicate; from: number; to: number }
  | { op: 'countFills'; fixed: (number | null)[]; p: NumPredicate }
  | { op: 'comboRemainder'; d: number; ra: number; rb: number; combo: Combo }
  | { op: 'shortfall'; n: number; d: number };

export type Combo = 'sum' | 'difference' | 'product' | 'aSquared' | 'sumOfSquares';

export interface SortPayload {
  kind: 'sort';
  numbers: string[];
  p: NumPredicate;
  yesLabel: string;
  noLabel: string;
}

export interface ConstructPayload {
  kind: 'construct';
  /** Digits of the number, left to right; null marks a blank the learner fills. */
  fixed: (number | null)[];
  p: NumPredicate;
  /** 'one': fill the blanks with any valid digits. 'all': pick every digit that works (single blank only). */
  mode: 'one' | 'all';
}

export interface RefutePayload {
  kind: 'refute';
  claim: Claim;
  claimText: string;
  /** Candidate counterexamples shown as chips. Each is [a] or [a, b]. */
  candidates: number[][];
  varNames: string[];
}

export interface ChoiceOption {
  id: string;
  label: string;
  /** For 'value' and 'predicate' modes. */
  num?: string;
  /** For 'factorization' mode: [prime, exponent] pairs. */
  factors?: [number, number][];
  /** For 'claim' mode. */
  claim?: Claim;
  /** Named misconception this distractor is built from (analytics + feedback). */
  misconception?: string;
}

export type ChoiceMode =
  | { mode: 'value'; spec: ValueSpec }
  | { mode: 'predicate'; p: NumPredicate }
  | { mode: 'factorization'; n: number }
  | { mode: 'claim' };

export interface ChoicePayload {
  kind: 'choice';
  question: ChoiceMode;
  options: ChoiceOption[];
}

export interface NumericPayload {
  kind: 'numeric';
  spec: ValueSpec;
  unit?: string;
}

/**
 * Factor Factory: split n into factor pairs until every piece is prime. The
 * answer is the multiset of primes; the checker multiplies them back and tests
 * each for primality by trial division.
 */
export interface FactorPayload {
  kind: 'factor';
  n: number;
}

/**
 * Remainder Rails: a token travels round a loop of stops; the learner picks the
 * stop it lands on. Each stop carries the value it stands for (a remainder, or a
 * units digit in a power cycle) and the checker compares that value with
 * `spec`, evaluated by brute force. Exactly one stop carries the right value.
 */
export interface RailPayload {
  kind: 'rail';
  spec: ValueSpec;
  stops: { label: string; value: number }[];
  /** How the walk is described on the board, e.g. "17 steps" or "the 23rd power". */
  walk: string;
  /** Loop length shown on the board (stops.length). */
  loop: number;
}

export type Payload = SortPayload | ConstructPayload | RefutePayload | ChoicePayload | NumericPayload | FactorPayload | RailPayload;

export type Response =
  | { kind: 'sort'; yes: number[] }
  | { kind: 'construct'; digits: number[] }
  | { kind: 'constructAll'; digits: number[] }
  | { kind: 'refute'; verdict: 'true' }
  | { kind: 'refute'; verdict: 'false'; counterexample: number[] }
  | { kind: 'choice'; optionId: string }
  | { kind: 'numeric'; value: string }
  | { kind: 'factor'; primes: number[] }
  | { kind: 'rail'; stop: number };

export interface Item {
  /** `${templateId}@${level}#${seed}` — enough to regenerate the item exactly. */
  id: string;
  templateId: string;
  skillId: string;
  family: string;
  board: BoardKind;
  level: number;
  seed: number;
  /** Version of the template that produced this item. */
  templateVersion: number;
  contentVersion: string;
  transfer: boolean;
  prompt: string;
  /** The rule, shown openly at easy levels and behind a "Show rule" tap at harder ones. */
  ruleLens?: string;
  hints: string[];
  explanation: string;
  payload: Payload;
  /** The generator's own answer. Used only by the content audit, never for grading. */
  key: Response;
}

/**
 * A board's work in progress, including incomplete work that is not yet a
 * Response (half-sorted tiles, one blank filled). Saved so a puzzle survives
 * a refresh or force-close exactly as the learner left it.
 */
export type BoardDraft =
  | { kind: 'sort'; bins: ('yes' | 'no' | null)[] }
  | { kind: 'construct'; fill: (number | null)[] }
  | { kind: 'constructAll'; picked: number[] }
  | { kind: 'refute'; choice: 'true' | number | null }
  | { kind: 'choice'; sel: string | null }
  | { kind: 'numeric'; text: string }
  /** Each split: the path of the piece split ('' = the whole number, then 'a'/'b' for its two parts) and the divisor used. */
  | { kind: 'factor'; splits: { path: string; d: number }[] }
  | { kind: 'rail'; stop: number | null };

export interface CheckResult {
  correct: boolean;
  /** Per-number marks for sort boards: true = placed correctly. */
  marks?: boolean[];
  /** For construct and refute boards: the full solution set, shown after answering. */
  solutions?: string[];
  misconception?: string;
  feedback?: string;
}

export type ItemDraft = Pick<Item, 'prompt' | 'ruleLens' | 'hints' | 'explanation' | 'payload' | 'key'>;

export interface GenContext {
  level: number;
  rng: import('./rng').Rng;
}

export interface Template {
  id: string;
  skillId: string;
  board: BoardKind;
  transfer?: boolean;
  /** Bump when the template's output changes, so old reports can be traced. */
  version: number;
  minLevel?: number;
  generate(ctx: GenContext): ItemDraft;
}
