import { router } from 'expo-router';
import { View } from 'react-native';
import { BannerSlot } from '../../ads/AdSlots';
import { SKILLS, TRACKS } from '../../content';
import { displayStatus } from '../../engine/mastery';
import { isReady } from '../../engine/mixer';
import { isPremium } from '../../monetization/entitlements';
import { shouldShowBanner } from '../../policy/ads';
import { adsLive, useApp } from '../../state/store';
import { Gap, Heading, LinkRow, Screen, Small, Stamp, Title } from '../../ui/kit';
import { color, space } from '../../ui/theme';

export default function Topics() {
  const s = useApp();
  const now = Date.now();
  const banner = shouldShowBanner('topics', { adsEnabled: adsLive(s), ageBand: s.profile?.ageBand, premium: isPremium(s.entitlements, now) });

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Title>Topics</Title>
        <Small style={{ marginTop: space.xs }}>Pick any skill to practise it on its own, or climb its ladder.</Small>
        {TRACKS.filter((t) => t.available).map((t) => (
          <View key={t.id} style={{ marginTop: space.xl }}>
            <Heading>{t.name}</Heading>
            <Small>{t.blurb}</Small>
            <Gap h={space.sm} />
            {SKILLS.filter((k) => k.track === t.id).map((k) => {
              const ready = isReady(s.skills, k.id);
              return (
                <LinkRow
                  key={k.id}
                  title={k.name}
                  detail={ready ? k.summary : `${k.summary}. Best after: ${k.prereqs.map((p) => SKILLS.find((x) => x.id === p)?.name).join(', ')}`}
                  right={<Stamp status={displayStatus(s.skills[k.id], now)} />}
                  onPress={() => router.push(`/skill/${k.id}`)}
                />
              );
            })}
          </View>
        ))}
        <View style={{ marginTop: space.xl }}>
          <Heading>Modes</Heading>
          <LinkRow title="Challenge builder" detail="Pick topics and difficulty; the app generates an unlimited run" onPress={() => router.push('/challenge')} />
        </View>
        <View style={{ marginTop: space.xl }}>
          <Heading style={{ color: color.inkSoft }}>Coming later</Heading>
          {TRACKS.filter((t) => !t.available).map((t) => (
            <LinkRow key={t.id} title={t.name} detail={t.blurb} />
          ))}
        </View>
      </Screen>
      {banner ? <BannerSlot /> : null}
    </View>
  );
}
