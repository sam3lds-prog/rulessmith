/**
 * Content types.
 *
 * An item's payload is *structured*: it says what the question means (a predicate,
 * a claim, a value to compute), not just how it reads. The checker in check.ts
 * evaluates that structure by brute force, so a learner's answer is never graded
 * against the generator's own key. The key is stored only so the content audit
 * (content.test.ts) can confirm the generator and the checker agree.
 */

export type BoardKind = 'sort' | 'construct' | 'refute' | 'choice' | 'numeric';

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

export type Payload = SortPayload | ConstructPayload | RefutePayload | ChoicePayload | NumericPayload;

export type Response =
  | { kind: 'sort'; yes: number[] }
  | { kind: 'construct'; digits: number[] }
  | { kind: 'constructAll'; digits: number[] }
  | { kind: 'refute'; verdict: 'true' }
  | { kind: 'refute'; verdict: 'false'; counterexample: number[] }
  | { kind: 'choice'; optionId: string }
  | { kind: 'numeric'; value: string };

export interface Item {
  /** `${templateId}@${level}#${seed}` — enough to regenerate the item exactly. */
  id: string;
  templateId: string;
  skillId: string;
  family: string;
  board: BoardKind;
  level: number;
  seed: number;
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
