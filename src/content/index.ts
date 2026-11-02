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
 * Templates switched off in the build. The same-day kill switch is the remote
 * list (`disabled_templates` in Supabase, fetched and cached by data/flags.ts),
 * which is merged in with `setRemoteDisabledTemplates`. Use this set only for
 * a template that must stay off in every build.
 */
export const DISABLED_TEMPLATES = new Set<string>([]);

let remoteDisabled = new Set<string>();

/** Replace the remote kill-switch list (from Supabase or its offline cache). */
export function setRemoteDisabledTemplates(ids: Iterable<string>) {
  remoteDisabled = new Set(ids);
}

export const remoteDisabledTemplates = () => [...remoteDisabled];

/** True when a template must not be served: switched off in the build or remotely. */
export const isTemplateDisabled = (templateId: string) => DISABLED_TEMPLATES.has(templateId) || remoteDisabled.has(templateId);

export const TEMPLATES: Template[] = [...DIVISIBILITY_TEMPLATES, ...PRIMES_TEMPLATES, ...REMAINDER_TEMPLATES];

export const TEMPLATE_BY_ID: Record<string, Template> = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

/** Servable templates for a skill: known, not switched off, and available at this level. */
export function templatesForSkill(skillId: string, level = 10): Template[] {
  return TEMPLATES.filter((t) => t.skillId === skillId && !isTemplateDisabled(t.id) && (t.minLevel ?? 1) <= level);
}

export type UnservableReason = 'unknown' | 'disabled' | 'stale';

/** Thrown when a puzzle cannot be served as asked. Callers replace the slot with a fresh one. */
export class TemplateUnavailableError extends Error {
  constructor(
    readonly templateId: string,
    readonly reason: UnservableReason,
  ) {
    super(
      reason === 'unknown'
        ? `Unknown template ${templateId}`
        : reason === 'disabled'
          ? `Template ${templateId} is switched off`
          : `Template ${templateId} has changed since this puzzle was made`,
    );
    this.name = 'TemplateUnavailableError';
  }
}

export interface GenerateOptions {
  /**
   * Serve a switched-off template anyway. Only for tools that rebuild a known
   * puzzle (the content audit, review sheets, report triage), never for learners.
   */
  allowDisabled?: boolean;
  /**
   * The template version the caller expects. If the template has changed since,
   * the same (template, level, seed) would be a different puzzle, so this throws
   * instead of silently serving it.
   */
  version?: number;
}

/**
 * Build the item for (template, level, seed). Deterministic. Refuses switched-off
 * templates and version mismatches (see GenerateOptions) with TemplateUnavailableError.
 */
export function generateItem(templateId: string, level: number, seed: number, opts: GenerateOptions = {}): Item {
  const t = TEMPLATE_BY_ID[templateId];
  if (!t) throw new TemplateUnavailableError(templateId, 'unknown');
  if (!opts.allowDisabled && isTemplateDisabled(t.id)) throw new TemplateUnavailableError(t.id, 'disabled');
  if (opts.version !== undefined && opts.version !== t.version) throw new TemplateUnavailableError(t.id, 'stale');
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
    templateVersion: t.version,
    contentVersion: `${CONTENT_VERSION}+${t.id}.v${t.version}`,
    transfer: Boolean(t.transfer),
  };
}

/** The item for a slot, or null when the slot can no longer be served (switched off, or its template changed). */
export function serveItem(slot: { templateId: string; level: number; seed: number; version?: number }): Item | null {
  try {
    return generateItem(slot.templateId, slot.level, slot.seed, { version: slot.version });
  } catch (e) {
    if (e instanceof TemplateUnavailableError) return null;
    throw e;
  }
}

export const templateVersionOf = (templateId: string) => TEMPLATE_BY_ID[templateId]?.version ?? 0;

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
