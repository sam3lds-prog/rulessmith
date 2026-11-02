/**
 * Human sign-off for each template family. The content audit only proves that
 * the generator and the checker agree; a person still has to read each family
 * at a low, middle and high level and confirm the wording, hints, wrong answers
 * and explanation (docs/review/README.md).
 *
 * Record a sign-off here after reviewing that family's worksheet entry. It is
 * pinned to the template version: bump the template and the sign-off goes
 * stale until someone reviews the new version.
 *
 * `npm run content:signoff` lists what is signed, stale and missing.
 * `REQUIRE_SIGNOFF=1 npm test` fails while anything is unsigned (use it before a beta or release).
 */
import { TEMPLATES } from './index';

export interface Signoff {
  /** The template version that was reviewed. */
  version: number;
  reviewer: string;
  /** YYYY-MM-DD */
  date: string;
  notes?: string;
}

export const SIGNOFFS: Record<string, Signoff> = {
  // 'div.digit-sum/sort': { version: 1, reviewer: 'Name', date: '2026-11-15' },
};

export interface SignoffStatus {
  signed: string[];
  /** Signed for an older version than the one that ships. */
  stale: { templateId: string; signed: number; current: number }[];
  missing: string[];
  /** Entries for templates that no longer exist. */
  unknown: string[];
}

export function signoffStatus(signoffs: Record<string, Signoff> = SIGNOFFS): SignoffStatus {
  const out: SignoffStatus = { signed: [], stale: [], missing: [], unknown: [] };
  const ids = new Set(TEMPLATES.map((t) => t.id));
  for (const t of TEMPLATES) {
    const s = signoffs[t.id];
    if (!s) out.missing.push(t.id);
    else if (s.version !== t.version) out.stale.push({ templateId: t.id, signed: s.version, current: t.version });
    else out.signed.push(t.id);
  }
  for (const id of Object.keys(signoffs)) if (!ids.has(id)) out.unknown.push(id);
  return out;
}
