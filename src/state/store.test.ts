/**
 * The store end to end, with React Native, AsyncStorage and Supabase replaced
 * by in-memory fakes. These are the guarantees the beta depends on:
 * one learner's progress never reaches another, two devices merge instead of
 * overwriting, and a hint or a half-done puzzle survives a restart.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkItem, type Item, type Response } from '../content';
import type { Attempt } from '../engine/types';

const h = vi.hoisted(() => {
  const g = globalThis as Record<string, any>;
  g.__mem = new Map<string, string>();
  g.__failWrite = null as null | ((key: string) => boolean);
  g.__server = {
    session: undefined as string | undefined,
    snapshots: new Map<string, any>(),
    versions: new Map<string, number>(),
    attempts: new Map<string, { attempt: any; receivedAt: string }[]>(),
    failPush: false,
    disabled: [] as string[],
    tick: 0,
    duringPush: null as null | (() => void),
    failPull: false,
    beforeSnapshotPush: null as null | (() => void),
  };
  return { mem: g.__mem as Map<string, string>, server: g.__server };
});

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
}));

vi.mock('@react-native-async-storage/async-storage', () => {
  const mem = (globalThis as Record<string, any>).__mem as Map<string, string>;
  return {
    default: {
      getItem: async (k: string) => mem.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        const fail = (globalThis as Record<string, any>).__failWrite as null | ((key: string) => boolean);
        if (fail?.(k)) throw new Error('QuotaExceededError');
        mem.set(k, v);
      },
      removeItem: async (k: string) => void mem.delete(k),
    },
  };
});

vi.mock('../analytics/pipeline', () => ({ startAnalytics: async () => undefined, uploadEvents: async () => 0, saveEventsNow: () => undefined }));

vi.mock('../data/cloud', () => {
  const s = (globalThis as Record<string, any>).__server;
  const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
  return {
    cloudConfigured: () => true,
    sessionUserId: async () => s.session,
    signOut: async () => void (s.session = undefined),
    pullSnapshot: async (u: string) => {
      if (s.failPull) throw new Error('Network request failed');
      return s.snapshots.has(u) ? { state: clone(s.snapshots.get(u)), version: s.versions.get(u) ?? 0 } : null;
    },
    pushSnapshot: async (u: string, _age: string, snap: unknown, _n: number, expected: number | null) => {
      const hook = s.beforeSnapshotPush;
      s.beforeSnapshotPush = null;
      hook?.();
      const current = s.snapshots.has(u) ? (s.versions.get(u) ?? 0) : null;
      if (current !== expected) return false;
      s.snapshots.set(u, { v: 2, ...clone(snap as object) });
      s.versions.set(u, (expected ?? 0) + 1);
      return true;
    },
    pullAttempts: async (u: string, cursor?: string) => {
      const list = s.attempts.get(u) ?? [];
      const from = cursor ? Date.parse(cursor) - 600000 : -Infinity;
      const rows = list.filter((r: { receivedAt: string }) => Date.parse(r.receivedAt) >= from);
      return { attempts: rows.map((r: { attempt: Attempt }) => clone(r.attempt)), cursor: rows.length ? rows[rows.length - 1].receivedAt : cursor };
    },
    pushAttempts: async (u: string, attempts: Attempt[]) => {
      if (s.failPush) throw new Error('Network request failed');
      const list = s.attempts.get(u) ?? [];
      for (const a of attempts) if (!list.some((r: { attempt: Attempt }) => r.attempt.id === a.id)) list.push({ attempt: clone(a), receivedAt: new Date(Date.now() + s.tick++).toISOString() });
      s.attempts.set(u, list);
      const hook = s.duringPush;
      s.duringPush = null;
      hook?.();
      return attempts.map((a) => a.id);
    },
    pushReports: async (_u: string, r: { id: string }[]) => r.map((x) => x.id),
    sendEvents: async () => undefined,
    fetchDisabledTemplates: async () => [...s.disabled],
    deleteAccount: async () => {
      s.snapshots.delete(s.session);
      s.attempts.delete(s.session);
      s.session = undefined;
    },
    sendCode: async () => ({ ok: true }),
    verifyCode: async () => ({ ok: true }),
  };
});

type StoreModule = typeof import('./store');

/** Start the app (again): fresh modules, same device storage and server. */
async function launch(): Promise<StoreModule> {
  vi.resetModules();
  const mod = await import('./store');
  await mod.bootstrapStore();
  return mod;
}

const ADULT = {
  ageBand: '18plus' as const,
  role: 'working-adult' as const,
  exams: ['gmat' as const],
  goal: { kind: 'skill' as const, text: '' },
  currentLevel: { kind: 'self' as const, rating: 3 as const },
  minutesPerDay: 20,
  daysPerWeek: 4,
  subjects: ['quant' as const],
  style: { timed: false },
  createdAt: Date.now(),
};

function onboard(m: StoreModule) {
  const s = m.useApp.getState();
  s.setProfile(ADULT);
  s.finishPlacement(true);
}

/** A wrong response for an item, found by checking a few simple candidates. */
function wrongResponse(item: Item): Response {
  const p = item.payload;
  const tries: Response[] =
    p.kind === 'numeric'
      ? [{ kind: 'numeric', value: '999999937' }, { kind: 'numeric', value: '0' }]
      : p.kind === 'choice'
        ? p.options.map((o) => ({ kind: 'choice' as const, optionId: o.id }))
        : p.kind === 'sort'
          ? [{ kind: 'sort', yes: [] }, { kind: 'sort', yes: p.numbers.map((_, i) => i) }]
          : p.kind === 'refute'
            ? [{ kind: 'refute', verdict: 'true' }, ...p.candidates.map((c) => ({ kind: 'refute' as const, verdict: 'false' as const, counterexample: c }))]
            : p.mode === 'all'
              ? [{ kind: 'constructAll', digits: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }, { kind: 'constructAll', digits: [0] }]
              : Array.from({ length: 10 }, (_, d) => ({ kind: 'construct' as const, digits: p.fixed.filter((x) => x === null).map(() => d) }));
  const wrong = tries.find((r) => !checkItem(item, r).correct);
  if (!wrong) throw new Error(`no wrong answer found for ${item.id}`);
  return wrong;
}

function answer(m: StoreModule, opts: { correct?: boolean; hint?: boolean } = {}) {
  const s = m.useApp.getState();
  const a = s.active!;
  const slot = a.slots[a.index];
  const item = s.currentItem()!;
  const response = opts.correct === false ? wrongResponse(item) : item.key;
  const r = checkItem(item, response);
  const result = s.recordAnswer(item, {
    correct: r.correct,
    hint: Boolean(opts.hint),
    hintsUsed: opts.hint ? 1 : 0,
    ruleShown: slot.support === 'guided',
    support: slot.support,
    ms: 4000,
    firstSeenAt: Date.now() - 4000,
    response,
    misconception: r.misconception,
  });
  return { item, result };
}

function playSkillSession(m: StoreModule, skillId = 'div.digit-sum') {
  const s = m.useApp.getState();
  expect(s.startSession('skill', { skillId }).ok).toBe(true);
  for (;;) {
    answer(m);
    if (m.useApp.getState().advance().done) break;
  }
  m.useApp.getState().finishSession();
}

beforeEach(() => {
  h.mem.clear();
  h.server.session = undefined;
  h.server.snapshots.clear();
  h.server.versions.clear();
  h.server.duringPush = null;
  h.server.beforeSnapshotPush = null;
  h.server.failPull = false;
  (globalThis as Record<string, any>).__failWrite = null;
  h.server.attempts.clear();
  h.server.failPush = false;
  h.server.disabled = [];
});

describe('one learner per bucket', () => {
  it("signing out and in as someone else never shows the first learner's progress", async () => {
    const m = await launch();
    onboard(m);
    playSkillSession(m);
    const mine = m.useApp.getState().attempts.length;
    expect(mine).toBeGreaterThan(0);

    h.server.session = 'user-a';
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true });
    expect(m.useApp.getState().attempts.length).toBe(mine);
    expect(h.server.attempts.get('user-a')!.length).toBe(mine);

    await m.useApp.getState().disconnectCloud();
    let s = m.useApp.getState();
    expect(s.owner).toBe('guest');
    expect(s.profile).toBeUndefined();
    expect(s.attempts.length).toBe(0);

    h.server.session = 'user-b';
    await s.connectCloud('b@example.com', 'user-b', { importGuest: false });
    s = m.useApp.getState();
    expect(s.attempts.length).toBe(0);
    expect(s.profile).toBeUndefined();
    expect(h.server.attempts.get('user-b') ?? []).toHaveLength(0);
    expect(h.server.snapshots.has('user-b')).toBe(false);

    await s.disconnectCloud();
    h.server.session = 'user-a';
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: false });
    s = m.useApp.getState();
    expect(s.attempts.length).toBe(mine);
    expect(s.profile?.ageBand).toBe('18plus');
  });

  it('guest progress joins an account only when the learner chooses it, and stays on the device otherwise', async () => {
    const m = await launch();
    onboard(m);
    playSkillSession(m);
    const guestAnswers = m.useApp.getState().attempts.length;

    h.server.session = 'user-a';
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: false });
    expect(m.useApp.getState().attempts.length).toBe(0);
    expect(h.server.attempts.get('user-a') ?? []).toHaveLength(0);

    await m.useApp.getState().disconnectCloud();
    expect(m.useApp.getState().attempts.length).toBe(guestAnswers);
    expect(m.useApp.getState().profile).toBeDefined();
  });

  it("importing on a second device keeps the account's own plan", async () => {
    // Device 1 made the account with a 45-minute plan.
    let m = await launch();
    m.useApp.getState().setProfile({ ...ADULT, minutesPerDay: 45 });
    m.useApp.getState().finishPlacement(true);
    h.server.session = 'user-a';
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true });
    const accountPlan = m.useApp.getState().plan!.createdAt;
    expect(h.server.snapshots.get('user-a').profile.minutesPerDay).toBe(45);

    // Device 2: fresh storage, onboards with 10 minutes, then signs in and adds its progress.
    h.mem.clear();
    m = await launch();
    m.useApp.getState().setProfile({ ...ADULT, minutesPerDay: 10 });
    m.useApp.getState().finishPlacement(true);
    playSkillSession(m);
    const guestAnswers = m.useApp.getState().attempts.length;
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true });
    const s = m.useApp.getState();
    expect(s.profile?.minutesPerDay).toBe(45);
    expect(s.plan?.createdAt).toBe(accountPlan);
    expect(s.attempts.length).toBe(guestAnswers);
    expect(h.server.snapshots.get('user-a').profile.minutesPerDay).toBe(45);
  });

  it("an account isn't opened on a new device until its server copy has loaded", async () => {
    const m = await launch();
    onboard(m);
    playSkillSession(m);
    const before = m.useApp.getState().attempts.length;
    h.server.session = 'user-a';
    h.server.failPull = true;
    const r = await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/couldn't be loaded/);
    expect(m.useApp.getState().owner).toBe('guest');
    expect(m.useApp.getState().attempts.length).toBe(before);
    // Back online: trying again works.
    h.server.failPull = false;
    expect((await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true })).ok).toBe(true);
    expect(m.useApp.getState().owner).toBe('user-a');
    expect(m.useApp.getState().attempts.length).toBe(before);
  });

  it('if the account could not be saved, the guest is not emptied', async () => {
    const m = await launch();
    onboard(m);
    playSkillSession(m);
    await m.flushSaves();
    const answers = m.useApp.getState().attempts.length;
    h.server.session = 'user-a';
    (globalThis as Record<string, any>).__failWrite = (k: string) => k.startsWith('rulesmith:user:');
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true });
    expect(m.useApp.getState().storageError).toMatch(/could not be saved/);
    const guest = JSON.parse(h.mem.get('rulesmith:guest:attempts')!);
    expect(guest.attempts.length).toBe(answers);
    (globalThis as Record<string, any>).__failWrite = null;
  });

  it('after an import the guest is empty, so the same progress cannot be imported twice', async () => {
    const m = await launch();
    onboard(m);
    playSkillSession(m);
    h.server.session = 'user-a';
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true });
    await m.useApp.getState().disconnectCloud();
    expect(m.useApp.getState().attempts.length).toBe(0);
    expect(m.useApp.getState().plan).toBeUndefined();
  });

  it('the bucket that was open is reopened at the next launch', async () => {
    let m = await launch();
    onboard(m);
    h.server.session = 'user-a';
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true });
    playSkillSession(m);
    await m.flushSaves();
    const n = m.useApp.getState().attempts.length;
    m = await launch();
    expect(m.useApp.getState().owner).toBe('user-a');
    expect(m.useApp.getState().attempts.length).toBe(n);
  });
});

describe('sync merges by attempt id', () => {
  const remoteAttempt = (i: number, at: number): Attempt => ({
    id: `other-device-${i}`,
    itemId: `div.digit-sum/sort@2#${1000 + i}`,
    templateId: 'div.digit-sum/sort',
    templateVersion: 1,
    contentVersion: 'x',
    skillId: 'div.digit-sum',
    family: 'div.digit-sum/sort',
    level: 2,
    transfer: false,
    support: 'guided',
    correct: true,
    hintBeforeAnswer: false,
    hintsUsed: 0,
    ruleShown: true,
    ms: 3000,
    at,
    mode: 'skill',
  });

  it('two devices with the same number of answers end up with all of them', async () => {
    const m = await launch();
    onboard(m);
    h.server.session = 'user-a';
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true });
    playSkillSession(m);
    await m.useApp.getState().syncNow();
    const local = m.useApp.getState().attempts.length;

    // Another device, same account, the same number of answers, plus its own tokens.
    const base = Date.now() - 3600000;
    h.server.attempts.set('user-a', [
      ...h.server.attempts.get('user-a')!,
      ...Array.from({ length: local }, (_, i) => ({ attempt: remoteAttempt(i, base + i), receivedAt: new Date(Date.now() + 5000 + i).toISOString() })),
    ]);
    const snap = h.server.snapshots.get('user-a');
    snap.tokenLedger = [...snap.tokenLedger, { id: 'session-other', delta: 5, reason: 'session', at: base }];
    const tokensBefore = m.useApp.getState().tokens;

    const r = await m.useApp.getState().syncNow();
    const s = m.useApp.getState();
    expect(r.ok).toBe(true);
    expect(r.pulled).toBe(local);
    expect(s.attempts.length).toBe(local * 2);
    expect(s.tokens).toBe(tokensBefore + 5);
    // Skills are rebuilt from every answer, not taken from whichever side had more.
    expect(s.skills['div.digit-sum'].attempts).toBe(local * 2);
    // And the server keeps both devices' answers.
    expect(h.server.attempts.get('user-a')!.length).toBe(local * 2);
    expect(h.server.snapshots.get('user-a').tokenLedger.some((e: { id: string }) => e.id === 'session-other')).toBe(true);
  });

  it('answers wait in the outbox while offline and leave it only once the server has them', async () => {
    const m = await launch();
    onboard(m);
    h.server.session = 'user-a';
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true });
    h.server.failPush = true;
    playSkillSession(m);
    await m.useApp.getState().syncNow();
    let s = m.useApp.getState();
    expect(s.outbox.attempts.length).toBe(s.attempts.length);
    expect(s.account.syncError).toMatch(/Network/);

    h.server.failPush = false;
    await s.syncNow();
    s = m.useApp.getState();
    expect(s.outbox.attempts).toEqual([]);
    expect(h.server.attempts.get('user-a')!.length).toBe(s.attempts.length);
    expect(s.account.syncError).toBeUndefined();
  });

  it('an answer given while an upload is in flight stays in the outbox and goes up next time', async () => {
    const m = await launch();
    onboard(m);
    h.server.session = 'user-a';
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true });
    m.useApp.getState().startSession('skill', { skillId: 'div.digit-sum' });
    answer(m);
    m.useApp.getState().advance();
    let lateId = '';
    h.server.duringPush = () => {
      answer(m);
      lateId = m.useApp.getState().attempts.at(-1)!.id;
    };
    await m.useApp.getState().syncNow();
    expect(lateId).not.toBe('');
    expect(m.useApp.getState().outbox.attempts).toEqual([lateId]);
    await m.useApp.getState().syncNow();
    expect(m.useApp.getState().outbox.attempts).toEqual([]);
    expect(h.server.attempts.get('user-a')!.some((r: { attempt: Attempt }) => r.attempt.id === lateId)).toBe(true);
  });

  it('two devices storing the snapshot at the same moment keep both sets of entries', async () => {
    const m = await launch();
    onboard(m);
    h.server.session = 'user-a';
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true });
    playSkillSession(m);
    // Another device stores its own snapshot between this device's pull and push.
    h.server.beforeSnapshotPush = () => {
      const other = JSON.parse(JSON.stringify(h.server.snapshots.get('user-a')));
      other.tokenLedger.push({ id: 'session-other-device', delta: 5, reason: 'session', at: Date.now() - 1000 });
      h.server.snapshots.set('user-a', other);
      h.server.versions.set('user-a', (h.server.versions.get('user-a') ?? 0) + 1);
    };
    const mine = m.useApp.getState().tokenLedger.map((e) => e.id);
    expect((await m.useApp.getState().syncNow()).ok).toBe(true);
    const ids = h.server.snapshots.get('user-a').tokenLedger.map((e: { id: string }) => e.id);
    expect(ids).toContain('session-other-device');
    for (const id of mine) expect(ids).toContain(id);
    expect(m.useApp.getState().tokenLedger.map((e) => e.id)).toContain('session-other-device');
  });

  it('an expired sign-in stops sync instead of writing to the wrong account', async () => {
    const m = await launch();
    onboard(m);
    h.server.session = 'user-a';
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true });
    h.server.session = undefined;
    playSkillSession(m);
    await m.useApp.getState().syncNow();
    expect(m.useApp.getState().account.needsSignIn).toBe(true);
    expect(m.useApp.getState().outbox.attempts.length).toBeGreaterThan(0);
  });
});

describe('the learning record', () => {
  it('stores the response, versions, support and misconception for every answer', async () => {
    const m = await launch();
    onboard(m);
    m.useApp.getState().startSession('skill', { skillId: 'div.digit-sum' });
    const { item } = answer(m, { correct: false });
    const a = m.useApp.getState().attempts.at(-1)!;
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.response).toBeDefined();
    expect(a.templateVersion).toBe(item.templateVersion);
    expect(a.contentVersion).toBe(item.contentVersion);
    expect(a.support).toBe('guided');
    expect(a.ruleShown).toBe(true);
    expect(a.sessionId).toBe(m.useApp.getState().active!.id);
    if (item.payload.kind === 'choice') expect(a.misconception).toBeDefined();
  });

  it('each puzzle is graded once, even if the answer is sent twice', async () => {
    const m = await launch();
    onboard(m);
    m.useApp.getState().startSession('skill', { skillId: 'div.digit-sum' });
    answer(m);
    answer(m, { correct: false });
    expect(m.useApp.getState().attempts.length).toBe(1);
    expect(m.useApp.getState().active!.results[0].correct).toBe(true);
  });

  it('a hint opened before a restart is still there after it', async () => {
    let m = await launch();
    onboard(m);
    m.useApp.getState().startSession('skill', { skillId: 'div.digit-sum' });
    const item = m.useApp.getState().currentItem()!;
    m.useApp.getState().saveProgress({ itemId: item.id, draft: null, hints: 1, ruleRevealed: true, firstSeenAt: 111, activeMs: 9000 });
    await m.flushSaves();

    m = await launch();
    const a = m.useApp.getState().active!;
    expect(a.progress).toEqual({ itemId: item.id, draft: null, hints: 1, ruleRevealed: true, firstSeenAt: 111, activeMs: 9000 });
    expect(m.useApp.getState().currentItem()!.id).toBe(item.id);
  });

  it('a hint is saved at once, not after the usual short delay', async () => {
    const m = await launch();
    onboard(m);
    m.useApp.getState().startSession('skill', { skillId: 'div.digit-sum' });
    const item = m.useApp.getState().currentItem()!;
    m.useApp.getState().saveProgress({ itemId: item.id, draft: null, hints: 0, ruleRevealed: false, firstSeenAt: 1, activeMs: 0 });
    await new Promise((r) => setTimeout(r, 0));
    m.useApp.getState().saveProgress({ itemId: item.id, draft: null, hints: 1, ruleRevealed: false, firstSeenAt: 1, activeMs: 500 });
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse(h.mem.get('rulesmith:guest')!).state.active.progress.hints).toBe(1);
  });

  it('a placement check resumes where it stopped', async () => {
    let m = await launch();
    m.useApp.getState().setProfile(ADULT);
    m.useApp.getState().startPlacementCheck();
    const first = m.useApp.getState().placementItem()!;
    m.useApp.getState().answerPlacement(first, {
      correct: true,
      hint: false,
      hintsUsed: 0,
      ruleShown: false,
      support: 'independent',
      ms: 2000,
      firstSeenAt: Date.now(),
      response: first.key,
    });
    m.useApp.getState().continuePlacement();
    const second = m.useApp.getState().placementItem()!;
    await m.flushSaves();
    m = await launch();
    expect(m.useApp.getState().placement?.state.answers.length).toBe(1);
    expect(m.useApp.getState().placementItem()!.id).toBe(second.id);
  });

  it('a switched-off puzzle is replaced on resume, without losing the answers before it', async () => {
    let m = await launch();
    onboard(m);
    m.useApp.getState().startSession('skill', { skillId: 'div.digit-sum' });
    answer(m);
    m.useApp.getState().advance();
    const blocked = m.useApp.getState().active!.slots[1].templateId;
    await m.flushSaves();

    h.server.disabled = [blocked];
    m = await launch();
    // The launch refresh of the kill switch runs in the background; let it land.
    await new Promise((r) => setTimeout(r, 0));
    const s = m.useApp.getState();
    expect(s.ensureServable()).toBe('replaced');
    const a = m.useApp.getState().active!;
    expect(a.slots[1].templateId).not.toBe(blocked);
    expect(a.results.length).toBe(1);
    expect(m.useApp.getState().currentItem()!.templateId).not.toBe(blocked);
  });
});

describe('saved data from before these fixes', () => {
  it('moves a v1 install into the right bucket and stops counting rule-shown answers as proof', async () => {
    const at = Date.now() - 2 * 86400000;
    const evidence = Array.from({ length: 10 }, (_, i) => ({
      correct: true,
      family: ['div.digit-sum/sort', 'div.digit-sum/construct', 'div.digit-sum/count'][i % 3],
      transfer: i === 2,
      day: i < 5 ? 'd1' : 'd2',
      level: 2,
      at,
    }));
    const v1 = {
      version: 1,
      state: {
        profile: ADULT,
        skills: { 'div.digit-sum': { skillId: 'div.digit-sum', rating: 1100, attempts: 10, evidence, status: 'secure', reviewStage: 0, nextReviewAt: at + 86400000 } },
        attempts: [{ itemId: 'div.digit-sum/sort@2#5', skillId: 'div.digit-sum', family: 'div.digit-sum/sort', level: 2, transfer: false, correct: true, hintBeforeAnswer: false, ms: 1, at, mode: 'skill' }],
        tokens: 13,
        sessionsCompleted: 2,
        entitlements: { ownedPacks: ['pack_challenge_700'] },
        account: { mode: 'cloud', email: 'a@example.com', userId: 'user-a', syncedAttemptAt: 0 },
      },
    };
    h.mem.set('rulesmith-v1', JSON.stringify(v1));
    const m = await launch();
    const s = m.useApp.getState();
    expect(s.owner).toBe('user-a');
    expect(h.mem.has('rulesmith-v1')).toBe(false);
    // All ten answers were at level 2, where v1 showed the rule: Practicing, not Secure.
    expect(s.skills['div.digit-sum'].status).toBe('practicing');
    expect(s.tokens).toBe(13);
    expect(s.sessionsCompleted).toBe(2);
    expect(s.attempts[0].id).toBe(`legacy-${at}-div.digit-sum/sort@2#5`);
    expect(s.attempts[0].support).toBe('guided');
    expect(s.outbox.attempts).toEqual([s.attempts[0].id]);
    expect(s.entitlements.ownedPacks).toEqual(['pack_challenge_top']);
  });

  it('keeps carried-over progress when skills are rebuilt (import, or answers from another device)', async () => {
    const at = Date.now() - 5 * 86400000;
    const evidence = Array.from({ length: 6 }, (_, i) => ({ correct: true, family: 'div.last-digit/sort', transfer: false, day: 'd1', level: 6, at }));
    const v1 = {
      version: 1,
      state: {
        profile: ADULT,
        // Practicing from answers older than the capped log, and a placement rating written straight onto a skill.
        skills: {
          'div.last-digit': { skillId: 'div.last-digit', rating: 1250, attempts: 30, evidence, status: 'practicing', reviewStage: 0 },
          'pf.primes': { skillId: 'pf.primes', rating: 1400, attempts: 0, evidence: [], status: 'new', reviewStage: 0 },
        },
        attempts: [],
        account: { mode: 'device' },
      },
    };
    h.mem.set('rulesmith-v1', JSON.stringify(v1));
    const m = await launch();
    h.server.session = 'user-a';
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true });
    let s = m.useApp.getState();
    expect(s.skills['div.last-digit'].status).toBe('practicing');
    expect(s.skills['pf.primes'].rating).toBe(1400);
    // Another device's answer arrives: the rebuild starts from the carried-over states.
    h.server.attempts.set('user-a', [
      {
        attempt: {
          id: 'other-1', itemId: 'div.last-digit/sort@3#1', templateId: 'div.last-digit/sort', templateVersion: 1, contentVersion: 'x',
          skillId: 'div.last-digit', family: 'div.last-digit/sort', level: 3, transfer: false, support: 'independent', correct: true,
          hintBeforeAnswer: false, hintsUsed: 0, ruleShown: false, ms: 1000, at: Date.now() - 1000, mode: 'skill',
        },
        receivedAt: new Date(Date.now() + 60000).toISOString(),
      },
    ]);
    await m.useApp.getState().syncNow();
    s = m.useApp.getState();
    expect(s.skills['div.last-digit'].status).toBe('practicing');
    expect(s.skills['div.last-digit'].attempts).toBe(31);
    expect(s.skills['pf.primes'].rating).toBe(1400);
  });
});

describe('deleting', () => {
  it("won't delete an account the saved sign-in doesn't belong to", async () => {
    const m = await launch();
    onboard(m);
    h.server.session = 'user-a';
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true });
    // Another tab signed in as someone else.
    h.server.session = 'user-b';
    h.server.attempts.set('user-b', []);
    const r = await m.useApp.getState().deleteAllData();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Nothing was deleted/);
    expect(h.server.attempts.has('user-b')).toBe(true);
    expect(m.useApp.getState().profile).toBeDefined();
  });

  it('removes the account and everything saved on the device', async () => {
    const m = await launch();
    onboard(m);
    playSkillSession(m);
    h.server.session = 'user-a';
    await m.useApp.getState().connectCloud('a@example.com', 'user-a', { importGuest: true });
    expect((await m.useApp.getState().deleteAllData()).ok).toBe(true);
    const s = m.useApp.getState();
    expect(s.owner).toBe('guest');
    expect(s.attempts.length).toBe(0);
    expect(s.profile).toBeUndefined();
    expect(h.server.attempts.has('user-a')).toBe(false);
    expect([...h.mem.keys()].some((k) => k.startsWith('rulesmith:user:user-a'))).toBe(false);
  });
});
