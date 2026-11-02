/**
 * Daily puzzle: the same puzzle for everyone on a given date, so results can
 * be shared spoiler-free. Rotates through tactile board families at a steady
 * mid difficulty.
 */
import { isTemplateDisabled, templateVersionOf } from '../content';
import { hashString } from '../content/rng';
import type { Slot } from './types';

const ROTATION = [
  'div.digit-sum/construct',
  'div.combined/refute',
  'pf.primes/sort',
  'div.last-two/sort',
  'rem.basics/weekday',
  'div.two-rules/construct',
  'pf.powers/refute',
  'div.combined/sort',
  'rem.cycles/units',
  'div.build/from-scratch',
  'pf.factorize/choose',
  'div.sums/refute',
];

/**
 * The day's puzzle. If the scheduled template is switched off, the next one in
 * the rotation is used, so everyone with the same kill-switch list still gets
 * the same puzzle. Null only if the whole rotation is switched off.
 */
export function dailySlot(day: string): Slot | null {
  const h = hashString(`daily:${day}`);
  for (let i = 0; i < ROTATION.length; i++) {
    const templateId = ROTATION[(h + i) % ROTATION.length];
    if (isTemplateDisabled(templateId)) continue;
    return {
      skillId: templateId.split('/')[0],
      templateId,
      version: templateVersionOf(templateId),
      level: 4,
      seed: (h % 2147483646) + 1,
      band: 'practice',
      reason: 'daily',
      support: 'independent',
    };
  }
  return null;
}

/** Spoiler-free share text: says how it went, never what the answer was. */
export function dailyShareText(appName: string, day: string, correct: boolean, ms: number, hints: number): string {
  const secs = Math.round(ms / 1000);
  const time = secs >= 60 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : `${secs}s`;
  const how = correct ? `Solved in ${time}${hints === 0 ? ', no hints' : `, ${hints} hint${hints === 1 ? '' : 's'}`}` : 'Not today. Back tomorrow';
  return `${appName} daily puzzle, ${day}\n${how}.`;
}
