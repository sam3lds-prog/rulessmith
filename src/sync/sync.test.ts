import { beforeEach, describe, expect, it } from 'vitest';
import { flushEvents, QUEUE_CAP, recentEvents, resetQueueForTests, setAnalyticsContext, track } from '../analytics/track';
import { createRng } from '../content/rng';
import { applyAttempt, newSkillState } from '../engine/mastery';
import { DAY_MS } from '../engine/time';
import type { Attempt } from '../engine/types';
import { INITIAL, type Data } from '../state/types';
import { applyPlacementRun, derived, importGuest, mergeAttempts, mergeRemote, mergeSynced, pickSynced, rebuildSkills, streakFrom } from './merge';
import { fromAttemptRow, toAttemptRow } from './rows';

const NOW = new Date(2026, 10, 2, 9).getTime();
const FAMS = ['div.digit-sum/sort', 'div.digit-sum/construct', 'div.digit-sum/count'];

function randomAttempts(seed: number, n: number, prefix = 'a'): Attempt[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, (_, i) => {
    const family = rng.pick(FAMS);
    return {
      id: `${prefix}${i}`,
      itemId: `${family}@3#${i}`,
      templateId: family,
      templateVersion: 1,
      contentVersion: 't',
      skillId: rng.chance(0.7) ? 'div.digit-sum' : 'div.last-digit',
      family,
      level: rng.int(1, 6),
      transfer: family.endsWith('count'),
      support: rng.chance(0.5) ? 'guided' : 'independent',
      correct: rng.chance(0.75),
      hintBeforeAnswer: rng.chance(0.15),
      hintsUsed: 0,
      ruleShown: false,
      ms: rng.int(2000, 40000),
      at: NOW + i * 3 * 3600 * 1000,
      mode: 'skill',
    } satisfies Attempt;
  });
}

const data = (over: Partial<Data> = {}): Data => ({ ...INITIAL, ...over });

describe('rebuilding skills from attempts', () => {
  it('gives exactly the state the app reaches answering live, one attempt at a time', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const attempts = randomAttempts(seed, 60);
      const live: Record<string, ReturnType<typeof newSkillState>> = {};
      for (const a of attempts) live[a.skillId] = applyAttempt(live[a.skillId] ?? newSkillState(a.skillId), a, a.at).state;
      expect(rebuildSkills(attempts, [])).toEqual(live);
    }
  });

  it('replays placement where it happened: it sets ratings only for skills with no practice yet', () => {
    const practice = randomAttempts(7, 5).map((a) => ({ ...a, skillId: 'div.digit-sum' }));
    const run = { at: NOW + 20 * 3600 * 1000, ratings: { 'div.digit-sum': 1500, 'pf.primes': 1400 } };
    const rebuilt = rebuildSkills(practice, [run]);
    expect(rebuilt['pf.primes'].rating).toBe(1400);
    expect(rebuilt['div.digit-sum'].rating).not.toBe(1500);
    const live = applyPlacementRun(rebuildSkills(practice, []), practice, run);
    expect(rebuilt).toEqual(live);
  });

  it('merging is order-independent: either device ends with the same record', () => {
    const a = randomAttempts(11, 30, 'x');
    const b = randomAttempts(12, 30, 'y').map((x) => ({ ...x, at: x.at + 1000 }));
    const ab = mergeAttempts(a, b);
    const ba = mergeAttempts(b, a);
    expect(ab).toEqual(ba);
    expect(ab.length).toBe(60);
    expect(mergeAttempts(ab, a)).toEqual(ab);
    expect(rebuildSkills(ab, [])).toEqual(rebuildSkills(ba, []));
  });
});

describe('merging snapshots', () => {
  it('ledgers add up across devices; the newer profile wins; ladder bests keep the maximum', () => {
    const left = pickSynced(
      data({
        tokenLedger: [{ id: 't1', delta: 5, reason: 'session', at: 1 }],
        sessionLog: [{ id: 's1', mode: 'skill', at: NOW, correct: 4, total: 6, early: false }],
        ladderBest: { 'div.digit-sum': 4 },
        profile: { createdAt: 1, updatedAt: 10 } as Data['profile'],
      }),
    );
    const right = pickSynced(
      data({
        tokenLedger: [
          { id: 't1', delta: 5, reason: 'session', at: 1 },
          { id: 't2', delta: -10, reason: 'bonus-run', at: 2 },
        ],
        sessionLog: [{ id: 's2', mode: 'skill', at: NOW + DAY_MS, correct: 2, total: 6, early: false }],
        ladderBest: { 'div.digit-sum': 6, 'pf.primes': 2 },
        profile: { createdAt: 1, updatedAt: 20 } as Data['profile'],
      }),
    );
    const m = mergeSynced(left, right);
    expect(m.tokenLedger.map((e) => e.id)).toEqual(['t1', 't2']);
    expect(m.sessionLog.length).toBe(2);
    expect(m.ladderBest).toEqual({ 'div.digit-sum': 6, 'pf.primes': 2 });
    expect(m.profile?.updatedAt).toBe(20);
    expect(mergeSynced(left, right, 'a').profile?.updatedAt).toBe(10);
    const d = derived(m);
    expect(d.tokens).toBe(-5);
    expect(d.sessionsCompleted).toBe(2);
    expect(d.streak.count).toBe(2);
  });

  it('a merge with nothing new does not rebuild skills', () => {
    const attempts = randomAttempts(3, 10);
    const local = data({ attempts, skills: { marker: newSkillState('marker') } });
    const { data: out, changed } = mergeRemote(local, { synced: pickSynced(local), attempts: attempts.slice(0, 4) });
    expect(changed).toBe(false);
    expect(out.skills).toBe(local.skills);
  });

  it('importing a guest keeps the account plan, merges answers, and queues them all for upload', () => {
    const guest = data({ attempts: randomAttempts(5, 8, 'g'), plan: { createdAt: 99 } as Data['plan'] });
    const account = data({ attempts: randomAttempts(6, 3, 'u'), plan: { createdAt: 1 } as Data['plan'] });
    const out = importGuest(account, guest);
    expect(out.plan?.createdAt).toBe(1);
    expect(out.attempts.length).toBe(11);
    expect(out.outbox.attempts.sort()).toEqual(guest.attempts.map((a) => a.id).sort());
    expect(Object.values(out.skills).reduce((n, s) => n + s.attempts, 0)).toBe(11);
  });

  it('counts a streak across calendar days, including daylight-saving changes', () => {
    expect(streakFrom([])).toEqual({ count: 0 });
    expect(streakFrom(['2026-10-31', '2026-11-01', '2026-11-02'])).toEqual({ lastDay: '2026-11-02', count: 3 });
    expect(streakFrom(['2026-10-30', '2026-11-01', '2026-11-02'])).toEqual({ lastDay: '2026-11-02', count: 2 });
  });
});

describe('server rows', () => {
  it('an attempt comes back from the server exactly as it went up', () => {
    const a: Attempt = {
      ...randomAttempts(9, 1)[0],
      response: { kind: 'construct', digits: [4, 7] },
      misconception: 'sum-equals-nine',
      firstSeenAt: NOW - 5000,
      sessionId: 'sess-1',
    };
    const row = toAttemptRow('user-1', a);
    expect(row.user_id).toBe('user-1');
    expect(fromAttemptRow({ ...row, received_at: new Date().toISOString() })).toEqual(a);
  });
});

describe('analytics queue', () => {
  beforeEach(() => resetQueueForTests());

  it('never attaches identifiers for minors or before the learner says they are an adult', () => {
    setAnalyticsContext({ installId: 'install-1', userId: 'user-1' });
    track('try_puzzle_answered', {});
    setAnalyticsContext({ ageBand: '13to17' });
    track('item_answered', {});
    setAnalyticsContext({ ageBand: '18plus' });
    track('item_answered', {});
    const [visitor, teen, adult] = recentEvents();
    expect([visitor.installId, visitor.userId]).toEqual([undefined, undefined]);
    expect([teen.installId, teen.userId]).toEqual([undefined, undefined]);
    expect([adult.installId, adult.userId]).toEqual(['install-1', 'user-1']);
  });

  it('keeps events until the server accepts them', async () => {
    for (let i = 0; i < 150; i++) track('item_answered', { i });
    let calls = 0;
    const sent = await flushEvents(async () => {
      calls += 1;
      if (calls === 2) throw new Error('offline');
    });
    expect(sent).toBe(100);
    expect(recentEvents().length).toBe(50);
    expect(await flushEvents(async () => undefined)).toBe(50);
    expect(recentEvents().length).toBe(0);
  });

  it('caps the queue and reports what it had to drop', async () => {
    for (let i = 0; i < QUEUE_CAP + 25; i++) track('item_answered', {});
    expect(recentEvents().length).toBe(QUEUE_CAP);
    const names: string[] = [];
    await flushEvents(async (batch) => void names.push(...batch.map((e) => e.name)));
    expect(names).toContain('events_dropped');
  });
});
