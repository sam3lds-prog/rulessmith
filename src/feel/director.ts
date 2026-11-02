/**
 * Plays the feedback grammar (feel/events.ts) on the device: one call per
 * event, and every effect respects the learner's settings. Sounds respect the
 * phone's silent switch, mix with other audio, and never play on their own
 * (only in answer to a tap). Haptics are skipped on web.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { useApp } from '../state/store';
import { CELEBRATIONS, FEEL, type FeelEvent, type HapticId, type SoundId } from './events';

const SOURCES: Record<SoundId, number> = {
  tick: require('../../assets/sounds/tick.wav'),
  pop: require('../../assets/sounds/pop.wav'),
  rise: require('../../assets/sounds/rise.wav'),
  note: require('../../assets/sounds/note.wav'),
  chime: require('../../assets/sounds/chime.wav'),
  reveal: require('../../assets/sounds/reveal.wav'),
};

const players: Partial<Record<SoundId, AudioPlayer>> = {};
let systemReduceMotion = false;
let started = false;
const listeners = new Set<(v: boolean) => void>();

const isServer = () => Platform.OS === 'web' && typeof window === 'undefined';

/** Called once at launch. */
export function startFeel() {
  if (started || isServer()) return;
  started = true;
  void AccessibilityInfo.isReduceMotionEnabled()
    .then((v) => {
      systemReduceMotion = v;
      listeners.forEach((l) => l(v));
    })
    .catch(() => undefined);
  AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
    systemReduceMotion = v;
    listeners.forEach((l) => l(v));
  });
  void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
}

function play(id: SoundId) {
  if (isServer()) return;
  try {
    let p = players[id];
    if (!p) {
      p = createAudioPlayer(SOURCES[id]);
      p.volume = 0.5;
      players[id] = p;
    }
    void p.seekTo(0).catch(() => undefined);
    p.play();
  } catch {
    // Sound is decoration; never let it interrupt a puzzle.
  }
}

function buzz(id: HapticId) {
  if (Platform.OS === 'web') return;
  const run =
    id === 'selection'
      ? Haptics.selectionAsync()
      : id === 'light'
        ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        : id === 'soft'
          ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)
          : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  void run.catch(() => undefined);
}

/** Fire one feedback event. */
export function feel(event: FeelEvent) {
  const s = useApp.getState().settings;
  if (s.focus && CELEBRATIONS.includes(event)) return;
  const spec = FEEL[event];
  if (s.sound && spec.sound) play(spec.sound);
  if (s.haptics && spec.haptic) buzz(spec.haptic);
}

/** Motion is off when the device asks for it or the learner turned it off. */
export function useReduceMotion(): boolean {
  const own = useApp((s) => s.settings.reduceMotion);
  const [system, setSystem] = useState(systemReduceMotion);
  useEffect(() => {
    listeners.add(setSystem);
    return () => {
      listeners.delete(setSystem);
    };
  }, []);
  return own || system;
}

/** Ambient scenery moves only when motion is allowed and Focus is off. */
export function useAmbientMotion(): boolean {
  const reduce = useReduceMotion();
  const focus = useApp((s) => s.settings.focus);
  return !reduce && !focus;
}
