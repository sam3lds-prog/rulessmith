/**
 * Content registry: every template, the content version, and the kill switch.
 */
import { createRng } from './rng';
import { DIVISIBILITY_TEMPLATES } from './skills/divisibility';
import { PRIMES_TEMPLATES } from './skills/primes';
import { REMAINDER_TEMPLATES } from './skills/remainders';
import type { Item, Template } from './types';

/** Bump on every content release. Shipped in reports so defects can be traced. */
export const CONTENT_VERSION = '2026.11.0';

/**
 * Same-day kill switch: a template listed here is never served. In production
 * this list should come from remote config (see docs/CONTENT.md) so a defective
 * template can be switched off without an app release.
 */
export const DISABLED_TEMPLATES = new Set<string>([]);

export const TEMPLATES: Template[] = [...DIVISIBILITY_TEMPLATES, ...PRIMES_TEMPLATES, ...REMAINDER_TEMPLATES];

export const TEMPLATE_BY_ID: Record<string, Template> = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

export function templatesForSkill(skillId: string, level = 10): Template[] {
  return TEMPLATES.filter((t) => t.skillId === skillId && !DISABLED_TEMPLATES.has(t.id) && (t.minLevel ?? 1) <= level);
}

export function generateItem(templateId: string, level: number, seed: number): Item {
  const t = TEMPLATE_BY_ID[templateId];
  if (!t) throw new Error(`Unknown template ${templateId}`);
  const lv = Math.min(10, Math.max(1, Math.round(level)));
  const draft = t.generate({ level: lv, rng: createRng(seed) });
  return {
    ...draft,
    id: `${t.id}@${lv}#${seed}`,
    templateId: t.id,
    skillId: t.skillId,
    family: t.id,
    board: t.board,
    level: lv,
    seed,
    contentVersion: `${CONTENT_VERSION}+${t.id}.v${t.version}`,
    transfer: Boolean(t.transfer),
  };
}

/** Parse an item id back into its parts (used by content reports). */
export function parseItemId(id: string): { templateId: string; level: number; seed: number } | null {
  const m = /^(.+)@(\d+)#(\d+)$/.exec(id);
  if (!m) return null;
  return { templateId: m[1], level: Number(m[2]), seed: Number(m[3]) };
}

export * from './types';
export { checkItem, correctAnswerText } from './check';
export { SKILLS, SKILL_BY_ID, TRACKS, EXAMS, skillName } from './curriculum';
export type { ExamId, Skill, Track, TrackId } from './curriculum';
