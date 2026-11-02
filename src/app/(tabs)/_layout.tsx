import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router/js-tabs';
import { Platform } from 'react-native';
import { color, font } from '../../ui/theme';

type IconName = React.ComponentProps<typeof Feather>['name'];

const icon =
  (name: IconName) =>
  ({ color: c }: { color: unknown }) => <Feather name={name} size={22} color={c as string} />;

/** Four destinations: Play (the next quest), Plan (the exam map), Practice (checks and drills), Workshop (what you've made). */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.action,
        tabBarInactiveTintColor: color.inkFaint,
        tabBarStyle: {
          backgroundColor: color.paper,
          borderTopColor: color.rule,
          borderTopWidth: 1,
          // On web there are no safe-area insets, so give the labels room explicitly.
          ...(Platform.OS === 'web' ? { height: 68, paddingTop: 6, paddingBottom: 10 } : null),
        },
        tabBarLabelStyle: { fontFamily: font.label, fontSize: 12, lineHeight: 16 },
        sceneStyle: { backgroundColor: color.paper },
      }}
    >
      <Tabs.Screen name="play" options={{ title: 'Play', tabBarIcon: icon('play') }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: icon('map') }} />
      <Tabs.Screen name="practice" options={{ title: 'Practice', tabBarIcon: icon('check-circle') }} />
      <Tabs.Screen name="workshop" options={{ title: 'Workshop', tabBarIcon: icon('home') }} />
    </Tabs>
  );
}
