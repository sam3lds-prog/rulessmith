import { router } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { config } from '../config';
import { cloudConfigured } from '../data/cloud';
import { queuedCount } from '../analytics/track';
import { CONTENT_VERSION, EXAMS, remoteDisabledTemplates } from '../content';
import { formatShortDate, parseDay } from '../engine/time';
import { isPremium } from '../monetization/entitlements';
import { PRODUCT_BY_ID } from '../monetization/products';
import { policyFor } from '../policy/age';
import { useApp } from '../state/store';
import type { ExplainMode, FeelSettings } from '../state/types';
import { TOKEN_COSTS, TOKEN_REWARDS } from '../monetization/tokens';
import { WEEKLY_REWARD } from '../rewards/ledger';
import { BackLink, Body, Button, Gap, Heading, LinkRow, OptionRow, Plate, Row, Screen, Small, Title } from '../ui/kit';
import { color, space } from '../ui/theme';
import { useNow } from '../ui/useNow';

const FEEL_ROWS: { key: keyof FeelSettings; title: string; detail: string }[] = [
  { key: 'sound', title: 'Sounds', detail: 'Soft taps and chimes. Off when your phone is on silent.' },
  { key: 'haptics', title: 'Vibration', detail: 'A light tap when you place a tile or get it right.' },
  { key: 'reduceMotion', title: 'Reduce motion', detail: 'No animated transitions. Also follows your device setting.' },
];

const EXPLAIN_ROWS: { mode: ExplainMode; title: string; detail: string }[] = [
  { mode: 'all', title: 'Explain every answer', detail: "See why after each answer, right or wrong. Tap Next when you're ready." },
  { mode: 'mistakes', title: 'Explain my mistakes only', detail: 'Right answers move on by themselves. Wrong answers get the full explanation.' },
  {
    mode: 'skip',
    title: 'Skip explanations',
    detail: 'Right answers move on by themselves. Wrong answers show the correct answer, then move on after a few seconds. The explanation is one tap away.',
  },
];

export default function You() {
  const now = useNow();
  const s = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const p = s.profile;
  const premium = isPremium(s.entitlements, now);
  const policy = policyFor(p?.ageBand);

  const examText = p ? (p.exams.length ? p.exams.map((e) => EXAMS.find((x) => x.id === e)?.name).join(' and ') : 'No exam') : '';
  const dateText = p?.testDate ? `test around ${formatShortDate(parseDay(p.testDate))}` : 'no test date';

  return (
    <Screen>
      <BackLink />
      <Title>You and settings</Title>
      <Gap />
      {p ? (
        <>
          <Heading>Your plan</Heading>
          <LinkRow title={`${examText}, ${dateText}`} detail={`${p.minutesPerDay} minutes a day, ${p.daysPerWeek} days a week`} onPress={() => router.push('/plan')} />
          <LinkRow title="Change my answers and re-plan" detail="Exam, date, time and level" onPress={() => router.push('/onboarding/about')} />
        </>
      ) : null}

      <Gap h={space.xl} />
      <Heading>Membership</Heading>
      {premium ? (
        <Small style={{ marginTop: space.xs }}>
          Premium is active
          {s.entitlements.premiumUntil && s.entitlements.premiumUntil > now
            ? ` (${PRODUCT_BY_ID[s.entitlements.premiumProduct ?? '']?.title ?? 'subscription'}, renews ${formatShortDate(s.entitlements.premiumUntil)})`
            : s.entitlements.sprintUntil
              ? ` (Exam Sprint until ${formatShortDate(s.entitlements.sprintUntil)})`
              : ''}
          .
        </Small>
      ) : policy.canPurchase ? (
        <LinkRow title="See Premium and packs" detail="Unlimited runs and every level" onPress={() => router.push('/premium')} />
      ) : (
        <Small style={{ marginTop: space.xs }}>Purchases aren't available on this profile.</Small>
      )}
      {s.entitlements.ownedPacks.length ? (
        <Small style={{ marginTop: space.xs }}>Packs you own: {s.entitlements.ownedPacks.map((id) => PRODUCT_BY_ID[id]?.title).join(', ')}.</Small>
      ) : null}
      {policy.canPurchase ? (
        <Button
          title="Restore purchases"
          kind="quiet"
          busy={restoring}
          onPress={async () => {
            setRestoring(true);
            await s.restorePurchases();
            setRestoring(false);
          }}
          style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
        />
      ) : null}

      <Gap h={space.lg} />
      <Heading>Tokens</Heading>
      <Small style={{ marginTop: space.xs }}>
        You have {Math.max(0, s.tokens)}. Earn {TOKEN_REWARDS.sessionComplete} for each finished session, {TOKEN_REWARDS.dailyPuzzle} for each daily puzzle and {WEEKLY_REWARD} for a weekly goal. {TOKEN_COSTS.bonusRun} tokens buy one more session on a day you've used the free ones. Tokens are never sold, and hints and explanations are always free.
      </Small>

      <Gap h={space.xl} />
      <Heading>After each answer</Heading>
      <Small style={{ marginTop: space.xs }}>For practice and games. Concept checks always save explanations for the end.</Small>
      <View style={{ gap: space.sm, marginTop: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="After each answer">
        {EXPLAIN_ROWS.map((r) => (
          <OptionRow key={r.mode} label={r.title} detail={r.detail} selected={s.settings.explain === r.mode} onPress={() => s.setExplain(r.mode)} />
        ))}
      </View>
      <Small style={{ marginTop: space.sm }}>
        Every explanation is still in your recap and in Review my mistakes. On a phone or tablet with a screen reader on, nothing moves on by itself.
      </Small>

      <Gap h={space.xl} />
      <Heading>How it feels</Heading>
      {FEEL_ROWS.map((r) => (
        <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56 }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontSize: 16 }}>{r.title}</Body>
            <Small>{r.detail}</Small>
          </View>
          <Switch
            accessibilityLabel={r.title}
            value={s.settings[r.key]}
            onValueChange={(v) => s.setFeel({ [r.key]: v })}
            trackColor={{ true: color.action, false: color.ruleStrong }}
          />
        </View>
      ))}

      <Gap h={space.xl} />
      <Heading>Your data</Heading>
      <LinkRow
        title={s.account.mode === 'cloud' ? `Synced as ${s.account.email}` : 'Saved on this device'}
        detail={
          s.account.mode === 'cloud'
            ? s.account.needsSignIn
              ? 'Sign in again to sync'
              : 'Manage sync'
            : cloudConfigured() && policy.canCreateAccount
              ? 'Create an account to sync across devices'
              : 'Syncing across devices comes with accounts'
        }
        onPress={cloudConfigured() && policy.canCreateAccount ? () => router.push('/account') : undefined}
      />
      <LinkRow title="Privacy" detail="What we store and why" onPress={() => router.push('/privacy')} />
      {!confirmDelete ? (
        <Button title="Delete my data" kind="danger" onPress={() => setConfirmDelete(true)} style={{ marginTop: space.md }} />
      ) : (
        <Plate tone="warm" style={{ marginTop: space.md }}>
          <Body>This permanently deletes your profile, plan and progress{s.account.mode === 'cloud' ? ', including your synced account and anything saved on this device without an account' : ' from this device'}. Purchases stay with your app store account and can be restored.</Body>
          <Row>
            <Button title="Keep my data" kind="secondary" onPress={() => setConfirmDelete(false)} style={{ flex: 1 }} />
            <Button
              title="Delete"
              kind="danger"
              busy={deleting}
              onPress={async () => {
                setDeleting(true);
                const r = await s.deleteAllData();
                setDeleting(false);
                if (r.ok) router.replace('/welcome');
                else setDeleteError(r.error ?? 'Could not delete the account.');
              }}
              style={{ flex: 1 }}
            />
          </Row>
          {deleteError ? <Small style={{ color: color.wrong }}>{deleteError}</Small> : null}
        </Plate>
      )}

      {config.devTools ? (
        <>
          <Gap h={space.xl} />
          <Heading style={{ color: color.inkSoft }}>Developer</Heading>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
            <Small style={{ flex: 1 }}>Preview ad placements (ads are {config.adsEnabled ? 'on' : 'off'} in config)</Small>
            <Switch value={s.settings.previewAds} onValueChange={s.setPreviewAds} trackColor={{ true: color.action, false: color.ruleStrong }} />
          </View>
          <Small>Content reports stored: {s.reports.length}</Small>
          <Small>
            Saved as {s.owner === 'guest' ? 'guest' : 'account'}. Waiting to upload: {s.outbox.attempts.length} answers, {s.outbox.reports.length} reports, {queuedCount()} events.
          </Small>
          {remoteDisabledTemplates().length ? <Small>Switched off remotely: {remoteDisabledTemplates().join(', ')}</Small> : null}
        </>
      ) : null}

      <Gap h={space.xl} />
      <Small>Content {CONTENT_VERSION}</Small>
    </Screen>
  );
}
