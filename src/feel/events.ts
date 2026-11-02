/**
 * Feedback grammar: one table for every game. Each event has one coordinated
 * visual length, sound and haptic, and every effect respects the learner's
 * settings (feel/director.ts). Pure data.
 *
 * In independent checks nothing before submitting may hint at correctness:
 * only `select`, `place` and `submit` fire, and they sound the same whatever
 * the answer.
 */
export type FeelEvent = 'select' | 'place' | 'submit' | 'correct' | 'incorrect' | 'missionComplete' | 'projectReveal' | 'recallSuccess';

export type SoundId = 'tick' | 'pop' | 'rise' | 'note' | 'chime' | 'reveal';
export type HapticId = 'selection' | 'light' | 'success' | 'soft';

export interface FeelSpec {
  /** Visual duration range in ms (reduced motion shows the end state at once). */
  visualMs: [number, number];
  sound?: SoundId;
  haptic?: HapticId;
}

export const FEEL: Record<FeelEvent, FeelSpec> = {
  select: { visualMs: [80, 120], sound: 'tick', haptic: 'selection' },
  place: { visualMs: [160, 240], sound: 'pop', haptic: 'light' },
  submit: { visualMs: [120, 180], sound: 'tick', haptic: 'light' },
  correct: { visualMs: [350, 650], sound: 'rise', haptic: 'success' },
  incorrect: { visualMs: [200, 300], sound: 'note', haptic: 'soft' },
  missionComplete: { visualMs: [800, 1200], sound: 'chime', haptic: 'success' },
  projectReveal: { visualMs: [2000, 3000], sound: 'reveal', haptic: 'success' },
  recallSuccess: { visualMs: [350, 650], sound: 'rise', haptic: 'success' },
};

/** Events allowed while an independent answer is still open. */
export const NEUTRAL_EVENTS: FeelEvent[] = ['select', 'place', 'submit'];

/** Big moments. Focus keeps their visuals short and silences them. */
export const CELEBRATIONS: FeelEvent[] = ['missionComplete', 'projectReveal'];
