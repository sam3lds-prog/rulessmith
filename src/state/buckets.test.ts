import { describe, expect, it } from 'vitest';
import { applyAttempt, newSkillState } from '../engine/mastery';
import type { Attempt } from '../engine/types';
import { attemptsKey, bucketKey, createSaver, decodeBucket, encodeAttempts, encodeState, type KV } from './buckets';
import { INITIAL, type Data } from './types';

function memory(fail: (key: string) => boolean = () => false) {
  const map = new Map<string, string>();
  const kv: KV = {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => {
      if (fail(k)) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: async (k) => void map.delete(k),
  };
  return { map, kv };
}

const attempt = (i: number): Attempt => ({
  id: `a${i}`,
  itemId: `div.digit-sum/sort@2#${i}`,
  templateId: 'div.digit-sum/sort',
  templateVersion: 1,
  contentVersion: 't',
  skillId: 'div.digit-sum',
  family: 'div.digit-sum/sort',
  level: 2,
  transfer: false,
  support: 'guided',
  correct: true,
  hintBeforeAnswer: false,
  hintsUsed: 0,
  ruleShown: true,
  ms: 1000,
  at: 1_700_000_000_000 + i,
  mode: 'skill',
});

function withAttempts(n: number): Data {
  const attempts = Array.from({ length: n }, (_, i) => attempt(i));
  let st = newSkillState('div.digit-sum');
  for (const a of attempts) st = applyAttempt(st, a, a.at).state;
  return { ...INITIAL, attempts, skills: { 'div.digit-sum': st }, outbox: { attempts: attempts.map((a) => a.id), reports: [] } };
}

describe('saving a bucket', () => {
  it('writes the attempt log (with its outbox) first, and nothing else if that write fails', async () => {
    let failAttempts = true;
    const { map, kv } = memory((k) => failAttempts && k === attemptsKey('guest'));
    let data = withAttempts(3);
    const errors: unknown[] = [];
    const saver = createSaver(kv, () => ({ owner: 'guest', data }), { onError: (e) => errors.push(e) });
    await saver.flush();
    expect(map.has(bucketKey('guest'))).toBe(false);
    expect(errors.at(-1)).toBeInstanceOf(Error);

    // Storage recovers: the next save writes both, including the log it failed to write before.
    failAttempts = false;
    data = { ...data };
    await saver.flush();
    expect(errors.at(-1)).toBeUndefined();
    const back = decodeBucket(map.get(bucketKey('guest'))!, map.get(attemptsKey('guest'))!)!;
    expect(back.attempts.length).toBe(3);
    expect(back.outbox.attempts).toEqual(['a0', 'a1', 'a2']);
  });

  it('at launch, skills that are behind the saved attempt log are rebuilt from it', () => {
    const older = withAttempts(2);
    const newer = withAttempts(5);
    // The app stopped between writing the attempt log (5) and the rest (still from when there were 2).
    const back = decodeBucket(encodeState(older), encodeAttempts(newer))!;
    expect(back.attempts.length).toBe(5);
    expect(back.skills['div.digit-sum'].attempts).toBe(5);
    expect(back.outbox.attempts.length).toBe(5);
  });
});
