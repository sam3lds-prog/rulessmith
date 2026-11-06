/**
 * Worked examples for the Help tray: a different puzzle from the same family
 * at the same level, shown with its answer and its audited explanation.
 *
 * It is built with the puzzle's own template version, so a template that has
 * changed or been switched off gives no example. It is never a puzzle whose
 * answer matches the one on screen, so it can't give that answer away. The
 * answer shown comes from the checker (correctAnswerText), never from a key.
 * "Matches" means the answer as shown: for a missing digit, the whole number.
 * Pure: unit-tested.
 */
import { generateItem } from '../content';
import { correctAnswerText } from '../content/check';
import type { Item } from '../content/types';

const STEP = 104_729;

/** The answer as the learner would see it: for a missing digit, the whole number it makes. */
function shownAnswer(item: Item): string {
  const text = correctAnswerText(item);
  const p = item.payload;
  if (p.kind !== 'construct' || p.mode !== 'one') return text;
  let j = 0;
  return p.fixed.map((d) => (d === null ? text[j++] : String(d))).join('');
}

export function workedExample(item: Item): Item | null {
  let answer: string;
  try {
    answer = shownAnswer(item);
  } catch {
    return null;
  }
  for (let k = 1; k <= 8; k++) {
    const seed = (item.seed + k * STEP) % 2_147_483_647;
    let ex: Item;
    try {
      ex = generateItem(item.templateId, item.level, seed, { version: item.templateVersion });
    } catch {
      return null;
    }
    if (ex.id === item.id) continue;
    if (shownAnswer(ex) === answer) continue;
    if (JSON.stringify(ex.payload) === JSON.stringify(item.payload)) continue;
    return ex;
  }
  return null;
}
