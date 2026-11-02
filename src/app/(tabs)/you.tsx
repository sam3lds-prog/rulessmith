import { router } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { config } from '../../config';
import { cloudConfigured } from '../../data/cloud';
import { CONTENT_VERSION, EXAMS } from '../../content';
import { formatShortDate, parseDay } from '../../engine/time';
import { isPremium } from '../../monetization/entitlements';
import { PRODUCT_BY_ID } from '../../monetization/products';
import { policyFor } from '../../policy/age';
import { useApp } from '../../state/store';
import { Body, Button, Gap, Heading, LinkRow, Plate, Row, Screen, Small, Title } from '../../ui/kit';
import { color, space } from '../../ui/theme';

export default function You() {
  const s = useApp();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const now = Date.now();
  const p = s.profile;
  const premium = isPremium(s.entitlements, now);
  const policy = policyFor(p?.ageBand);

  const examText = p ? (p.exams.length ? p.exams.map((e) => EXAMS.find((x) => x.id === e)?.name).join(' and ') : 'No exam') : '';
  const dateText = p?.testDate ? `test around ${formatShortDate(parseDay(p.testDate))}` : 'no test date';

  return (
    <Screen>
      <Title>You</Title>
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
        You have {s.tokens}. Earn 5 for each finished session and 3 for each daily puzzle. Spend 10 on a bonus run. Tokens are never sold, and hints are always free.
      </Small>

      <Gap h={space.xl} />
      <Heading>Your data</Heading>
      <LinkRow
        title={s.account.mode === 'cloud' ? `Synced as ${s.account.email}` : 'Saved on this device'}
        detail={
          s.account.mode === 'cloud'
            ? 'Manage sync'
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
        <Plate tone="brass" style={{ marginTop: space.md }}>
          <Body>This permanently deletes your profile, plan and progress{s.account.mode === 'cloud' ? ', including your synced account' : ' from this device'}. Purchases stay with your app store account and can be restored.</Body>
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
          {deleteError ? <Small style={{ color: color.brick }}>{deleteError}</Small> : null}
        </Plate>
      )}

      {config.devTools ? (
        <>
          <Gap h={space.xl} />
          <Heading style={{ color: color.inkSoft }}>Developer</Heading>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
            <Small style={{ flex: 1 }}>Preview ad placements (ads are {config.adsEnabled ? 'on' : 'off'} in config)</Small>
            <Switch value={s.settings.previewAds} onValueChange={s.setPreviewAds} trackColor={{ true: color.cobalt, false: color.ruleStrong }} />
          </View>
          <Small>Content reports stored: {s.reports.length}</Small>
        </>
      ) : null}

      <Gap h={space.xl} />
      <Small>Content {CONTENT_VERSION}</Small>
    </Screen>
  );
}
