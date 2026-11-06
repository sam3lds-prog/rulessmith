/**
 * Worked examples for the Help tray: a different puzzle from the same family
 * at the same level, shown with its answer and its audited explanation.
 *
 * It is built with the puzzle's own template version, so a template that has
 * changed or been switched off gives no example. It is chosen from the seed
 * alone, never by looking at the puzzle's answer: an example picked to have a
 * *different* answer would give the answer away whenever a family has only a
 * few possible answers (0 or 1, 3 or 5), so it tells the learner nothing about
 * this puzzle's answer. It is never the same question (the same claim, the
 * same numbers). The answer shown comes from the checker, never from a key.
 * Pure: unit-tested.
 */
import { generateItem } from '../content';
import type { Item } from '../content/types';

const STEP = 104_729;

/** What makes two puzzles the same question, whatever their seeds. */
export function questionKey(item: Item): string {
  const p = item.payload;
  switch (p.kind) {
    case 'refute':
      return `refute:${p.claimText}`;
    case 'choice':
      // The same wording with different options (which of these is divisible by 5?) is a different question.
      return `choice:${item.prompt}:${JSON.stringify(p.question)}:${p.options.map((o) => o.label).sort().join('|')}`;
    case 'numeric':
    case 'rail':
      return `${p.kind}:${item.prompt}:${JSON.stringify(p.spec)}`;
    case 'construct':
      return `construct:${JSON.stringify([p.fixed, p.p, p.mode])}`;
    case 'factor':
      return `factor:${p.n}`;
    case 'sort':
      return `sort:${JSON.stringify([[...p.numbers].sort(), p.p])}`;
    case 'maze':
      return `maze:${JSON.stringify(p.cells)}`;
    case 'match':
      return `match:${JSON.stringify(p.left)}`;
  }
}

export function workedExample(item: Item): Item | null {
  const same = questionKey(item);
  for (let k = 1; k <= 8; k++) {
    const seed = (item.seed + k * STEP) % 2_147_483_647;
    let ex: Item;
    try {
      ex = generateItem(item.templateId, item.level, seed, { version: item.templateVersion });
    } catch {
      return null;
    }
    if (questionKey(ex) !== same) return ex;
  }
  return null;
}
