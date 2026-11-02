import { describe, expect, it } from 'vitest';
import { SIGNOFFS, signoffStatus } from './signoff';

describe('human sign-off', () => {
  it('every sign-off names a real template, a reviewer and a date', () => {
    const status = signoffStatus();
    expect(status.unknown).toEqual([]);
    for (const [id, s] of Object.entries(SIGNOFFS)) {
      expect(s.reviewer.trim(), id).not.toBe('');
      expect(s.date, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('a template change makes its sign-off stale', () => {
    const status = signoffStatus({ 'div.digit-sum/sort': { version: 0, reviewer: 'x', date: '2026-01-01' } });
    expect(status.stale.map((s) => s.templateId)).toEqual(['div.digit-sum/sort']);
  });

  // Off by default so day-to-day work isn't blocked; on for a beta or release build.
  it.runIf(process.env.REQUIRE_SIGNOFF === '1')('every family is signed off at its current version', () => {
    const status = signoffStatus();
    expect({ missing: status.missing, stale: status.stale }).toEqual({ missing: [], stale: [] });
  });

  it.runIf(process.env.SIGNOFF_REPORT === '1')('report', () => {
    const s = signoffStatus();
    console.log(
      `\nSigned: ${s.signed.length}. Stale: ${s.stale.length}. Missing: ${s.missing.length}.\n` +
        (s.stale.length ? `\nStale (re-review):\n${s.stale.map((x) => `  ${x.templateId} (signed v${x.signed}, now v${x.current})`).join('\n')}\n` : '') +
        (s.missing.length ? `\nNot yet reviewed:\n${s.missing.map((x) => `  ${x}`).join('\n')}\n` : ''),
    );
  });
});
