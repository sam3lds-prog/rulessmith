import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useApp, type StartResult } from '../state/store';
import { Button, Heading, Small } from './kit';
import { color, radius, space } from './theme';

/**
 * Starting a mission, check or session from any screen. If a session with
 * answers is already open, the store refuses (so its results are never lost)
 * and this asks: resume it, or end it (answers so far are kept) and start the
 * new one. Render `sheet` once on the screen.
 */
export function useStart() {
  const active = useApp((s) => s.active);
  const finish = useApp((s) => s.finishSession);
  const [pending, setPending] = useState<null | { run: () => StartResult; after?: (r: StartResult) => void }>(null);

  const start = (run: () => StartResult, after?: (r: StartResult) => void): StartResult => {
    const r = run();
    if (r.ok) router.push('/session');
    else if (r.reason === 'in-progress') setPending({ run, after });
    else after?.(r);
    return r;
  };

  const total = active ? (active.challenge ? active.challenge.length : active.slots.length) : 0;
  const sheet = (
    <Modal visible={!!pending && !!active} transparent animationType="fade" onRequestClose={() => setPending(null)}>
      <Pressable style={styles.backdrop} onPress={() => setPending(null)} accessibilityLabel="Close" />
      <View style={styles.wrap} pointerEvents="box-none">
        <View style={styles.card} accessibilityViewIsModal>
          <Heading style={{ fontSize: 20 }}>You have a session in progress</Heading>
          <Small style={{ color: color.ink }}>
            {active ? `${active.title}: ${active.results.length}${active.ladder ? '' : ` of ${total}`} answered.` : ''} Finish it first, or end it here. Answers you've given are kept either way.
          </Small>
          <Button
            title="Resume it"
            onPress={() => {
              setPending(null);
              router.push('/session');
            }}
          />
          <Button
            title="End it and start the new one"
            kind="secondary"
            onPress={() => {
              const p = pending;
              setPending(null);
              finish({ early: true });
              if (p) {
                const r = p.run();
                if (r.ok) router.push('/session');
                else p.after?.(r);
              }
            }}
          />
          <Button title="Not now" kind="quiet" onPress={() => setPending(null)} />
        </View>
      </View>
    </Modal>
  );
  return { start, sheet };
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(35,48,46,0.35)' },
  wrap: { flex: 1, justifyContent: 'center', padding: space.lg },
  card: { width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
});
