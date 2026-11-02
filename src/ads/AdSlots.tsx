/**
 * Ad slots. These render the placement and its rules; the ad itself is a
 * placeholder until AdMob is wired in Phase 4 (react-native-google-mobile-ads
 * NativeAdView for the session-break card, BannerAd for browse screens,
 * RewardedAd for the opt-in reward). See docs/MONETIZATION.md.
 *
 * The rules live in policy/ads.ts. The layout here keeps the native card to at
 * most ~40% of the screen, labels it "Ad" with an AdChoices icon, and never lets
 * app content overlap it. The learner's own Continue button sits outside it.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { color, font, radius, space, type } from '../ui/theme';

function AdBadge() {
  return (
    <View style={styles.badgeRow}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Ad</Text>
      </View>
      <View style={styles.choices} accessibilityLabel="AdChoices">
        <Text style={styles.choicesText}>i</Text>
      </View>
    </View>
  );
}

export function SessionBreakAdCard({ onRendered }: { onRendered?: () => void }) {
  const { height } = useWindowDimensions();
  useEffect(() => {
    onRendered?.();
  }, []);
  return (
    <View style={[styles.native, { maxHeight: Math.round(height * 0.4) }]} accessibilityLabel="Advertisement">
      <AdBadge />
      <View style={styles.media}>
        <Text style={type.micro}>Advertiser image</Text>
      </View>
      <View style={styles.nativeFoot}>
        <Text style={[type.label, { flex: 1 }]} numberOfLines={2}>
          Advertiser headline
        </Text>
        <View style={styles.cta}>
          <Text style={[type.label, { color: color.ink }]}>Open</Text>
        </View>
      </View>
    </View>
  );
}

export function BannerSlot() {
  return (
    <View style={styles.banner} accessibilityLabel="Advertisement">
      <AdBadge />
      <Text style={[type.micro, { flex: 1, textAlign: 'center' }]}>Banner ad</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  native: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: color.ruleStrong,
    borderRadius: radius.lg,
    backgroundColor: color.paperDeep,
    padding: space.md,
    gap: space.sm,
    overflow: 'hidden',
  },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { borderWidth: 1, borderColor: color.inkSoft, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  badgeText: { fontFamily: font.label, fontSize: 12, color: color.inkSoft },
  choices: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: color.inkSoft, alignItems: 'center', justifyContent: 'center' },
  choicesText: { fontFamily: font.bodyBold, fontSize: 12, color: color.inkSoft },
  media: { height: 96, borderRadius: radius.sm, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' },
  nativeFoot: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cta: { borderWidth: 1.5, borderColor: color.ink, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 6 },
  banner: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderTopWidth: 1,
    borderTopColor: color.rule,
    backgroundColor: color.paperDeep,
  },
});
