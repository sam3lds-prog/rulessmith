import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { track } from '../analytics/track';
import { isPremium } from '../monetization/entitlements';
import { PRODUCTS, type Product } from '../monetization/products';
import { policyFor } from '../policy/age';
import { useApp } from '../state/store';
import { BackLink, Body, Button, Gap, Heading, Plate, Screen, Small, Title } from '../ui/kit';
import { color, font, radius, space, type } from '../ui/theme';

export default function Premium() {
  const s = useApp();
  const [selected, setSelected] = useState('premium_annual');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const now = Date.now();
  const policy = policyFor(s.profile?.ageBand);
  const premium = isPremium(s.entitlements, now);

  useEffect(() => track('paywall_viewed', {}), []);

  const plans = PRODUCTS.filter((p) => p.type !== 'non_consumable');
  const packs = PRODUCTS.filter((p) => p.type === 'non_consumable');
  const chosen = PRODUCTS.find((p) => p.id === selected)!;

  const buy = async () => {
    setBusy(true);
    const r = await s.purchase(selected);
    setBusy(false);
    if (r.ok) setDone(chosen.title);
  };

  if (!policy.canPurchase) {
    return (
      <Screen footer={<Button title="Back" kind="secondary" onPress={() => router.back()} />}>
        <BackLink />
        <Title>Ask a parent</Title>
        <Gap />
        <Body>Purchases aren't available on a teen profile yet. Parent accounts, where a parent can approve Premium, are on the way. Everything free stays free: the daily puzzle, every hint and every explanation.</Body>
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen footer={<Button title="Start practising" onPress={() => router.replace('/today')} />}>
        <Gap h={space.xxl} />
        <Title>{done} is active.</Title>
        <Gap />
        <Body>Test purchase: no money moved. Real billing is connected before launch.</Body>
      </Screen>
    );
  }

  const isOwned = (p: Product) =>
    p.type === 'non_consumable' ? s.entitlements.ownedPacks.includes(p.id) : p.type === 'non_renewing' ? (s.entitlements.sprintUntil ?? 0) > now : premium;

  const Option = (p: Product) => {
    const on = selected === p.id;
    const owned = isOwned(p) && p.type !== 'non_renewing';
    return (
      <Pressable
        key={p.id}
        accessibilityRole="radio"
        accessibilityState={{ checked: on, disabled: owned }}
        disabled={owned}
        onPress={() => setSelected(p.id)}
        style={({ pressed }) => [styles.option, on && styles.optionOn, owned && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.label}>{p.title}</Text>
          <Text style={type.small}>{owned ? 'Owned' : p.blurb}</Text>
        </View>
        <Text style={styles.price}>
          {p.price}
          {p.period ? <Text style={type.micro}>/{p.period === 'year' ? 'yr' : 'mo'}</Text> : null}
        </Text>
      </Pressable>
    );
  };

  const cta =
    chosen.trialDays && !premium
      ? `Start ${chosen.trialDays}-day free trial`
      : chosen.type === 'non_consumable'
        ? `Buy for ${chosen.price}`
        : chosen.type === 'non_renewing'
          ? `Get 90 days for ${chosen.price}`
          : `Subscribe for ${chosen.price} a month`;

  return (
    <Screen
      footer={
        <>
          <Button title={cta} onPress={buy} busy={busy} disabled={isOwned(chosen) && chosen.type !== 'non_renewing'} />
          <Small style={{ textAlign: 'center' }}>Test mode: purchases complete instantly and nothing is charged.</Small>
        </>
      }
    >
      <BackLink />
      <Title>Practise without limits</Title>
      <Gap h={space.sm} />
      <Body>Premium gives you unlimited runs, every level from 1 to 10, every pack (including future ones while you subscribe), Challenge mode, and no ads.</Body>
      <Small style={{ marginTop: space.sm }}>Free stays useful: the daily puzzle, 3 runs a day, levels 1 to 3, and every hint and explanation.</Small>

      <Gap h={space.xl} />
      <Heading>Premium</Heading>
      <Gap h={space.sm} />
      <View style={{ gap: space.sm }}>{plans.map(Option)}</View>

      <Gap h={space.xl} />
      <Heading>Or own a pack</Heading>
      <Small>Packs are yours to keep and restore on any device. Premium already includes them.</Small>
      <Gap h={space.sm} />
      <View style={{ gap: space.sm }}>{packs.map(Option)}</View>

      <Gap h={space.xl} />
      <Plate>
        <Small style={{ color: color.ink }}>
          Subscriptions renew automatically until cancelled in your app store account settings, at least 24 hours before the period ends. The yearly plan's free trial converts to
          a paid subscription unless cancelled before it ends. Exam Sprint does not renew.
        </Small>
        <Button title="Restore purchases" kind="quiet" onPress={() => s.restorePurchases()} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />
      </Plate>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.rule,
    backgroundColor: color.surface,
  },
  optionOn: { borderColor: color.cobalt, borderWidth: 2.5, backgroundColor: color.cobaltWash },
  price: { fontFamily: font.display, fontSize: 20, color: color.ink, fontVariant: ['tabular-nums'] },
});
