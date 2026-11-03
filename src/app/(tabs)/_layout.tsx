import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router/js-tabs';
import { Platform } from 'react-native';
import { color, font } from '../../ui/theme';

type IconName = React.ComponentProps<typeof Feather>['name'];

const icon = (name: IconName) => {
  const TabIcon = ({ color: c }: { color: unknown }) => <Feather name={name} size={22} color={c as string} />;
  TabIcon.displayName = `TabIcon(${name})`;
  return TabIcon;
};

/** Four destinations: Today (the next useful step), My plan, Practice (topics, games, checks, mistakes) and Progress. */
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
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: icon('sun') }} />
      <Tabs.Screen name="plan" options={{ title: 'My plan', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="practice" options={{ title: 'Practice', tabBarIcon: icon('target') }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress', tabBarIcon: icon('bar-chart-2') }} />
    </Tabs>
  );
}
