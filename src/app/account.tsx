import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { cloudConfigured, sendCode, verifyCode } from '../data/cloud';
import { formatShortDate } from '../engine/time';
import { policyFor } from '../policy/age';
import { useApp } from '../state/store';
import { BackLink, Body, Button, Gap, Plate, Screen, Small, Title } from '../ui/kit';
import { color, font, radius, space } from '../ui/theme';

/** Create an account (or sign in) with a 6-digit email code, then sync. */
export default function Account() {
  const s = useApp();
  const [email, setEmail] = useState(s.account.email ?? '');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<boolean | null>(null);

  const done = () => router.replace('/today');

  if (!cloudConfigured() || !policyFor(s.profile?.ageBand).canCreateAccount) {
    return (
      <Screen footer={<Button title="Continue" onPress={done} />}>
        <BackLink />
        <Title>Saved on this device</Title>
        <Gap />
        <Body>
          {cloudConfigured()
            ? 'Accounts are for learners 18 and older for now, so your progress stays on this device.'
            : 'Accounts are not switched on in this build yet, so your progress stays on this device.'}
        </Body>
      </Screen>
    );
  }

  if (s.account.mode === 'cloud') {
    return (
      <Screen footer={<Button title="Continue" onPress={done} />}>
        <BackLink />
        <Title>{restored ? 'Welcome back' : 'Your account'}</Title>
        <Gap />
        <Body>
          Signed in as {s.account.email}.{' '}
          {restored ? 'Your progress from your other device is here.' : 'Your plan and progress sync after every session.'}
        </Body>
        <Small style={{ marginTop: space.sm }}>
          {s.account.syncError
            ? `Last sync failed: ${s.account.syncError}`
            : s.account.lastSyncAt
              ? `Last synced ${formatShortDate(s.account.lastSyncAt)}.`
              : 'Not synced yet.'}
        </Small>
        <Gap />
        <Button title="Sync now" kind="secondary" busy={busy} onPress={async () => {
          setBusy(true);
          await s.syncNow();
          setBusy(false);
        }} />
        <Gap h={space.sm} />
        <Button title="Sign out" kind="quiet" onPress={() => s.disconnectCloud()} />
      </Screen>
    );
  }

  const submitEmail = async () => {
    setBusy(true);
    setError(null);
    const r = await sendCode(email.trim());
    setBusy(false);
    if (r.ok) setStage('code');
    else setError(r.error ?? 'Could not send the code.');
  };

  const submitCode = async () => {
    setBusy(true);
    setError(null);
    const v = await verifyCode(email.trim(), code.trim());
    if (!v.ok || !v.userId) {
      setBusy(false);
      setError(v.error ?? 'That code did not work.');
      return;
    }
    const c = await s.connectCloud(email.trim(), v.userId);
    setBusy(false);
    if (!c.ok) setError(c.error ?? 'Signed in, but the first sync failed. Your progress is safe on this device; try Sync now.');
    else setRestored(c.restored);
  };

  return (
    <Screen
      footer={
        <>
          {stage === 'email' ? (
            <Button title="Email me a code" onPress={submitEmail} busy={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())} />
          ) : (
            <Button title="Verify and sync" onPress={submitCode} busy={busy} disabled={code.trim().length < 6} />
          )}
          <Button title="Not now" kind="quiet" onPress={done} />
        </>
      }
    >
      <BackLink />
      <Title>Save your plan to an account</Title>
      <Gap />
      <Body>Your plan and progress will follow you to any device. No password: we email you a 6-digit code.</Body>
      <Gap />
      {stage === 'email' ? (
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={color.inkFaint}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          style={styles.input}
          accessibilityLabel="Email"
        />
      ) : (
        <>
          <Small>We sent a code to {email}.</Small>
          <Gap h={space.sm} />
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))}
            placeholder="6-digit code"
            placeholderTextColor={color.inkFaint}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            style={[styles.input, styles.code]}
            accessibilityLabel="Code"
          />
          <Button title="Use a different email" kind="quiet" onPress={() => setStage('email')} />
        </>
      )}
      {error ? (
        <Plate tone="brass" style={{ marginTop: space.md }}>
          <Small style={{ color: color.ink }}>{error}</Small>
        </Plate>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: color.ruleStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    fontFamily: font.body,
    fontSize: 17,
    color: color.ink,
    backgroundColor: color.surface,
  },
  code: { fontFamily: font.bodyBold, fontSize: 24, letterSpacing: 6 },
});
