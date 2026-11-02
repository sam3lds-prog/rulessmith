import { AtkinsonHyperlegible_400Regular } from '@expo-google-fonts/atkinson-hyperlegible/400Regular';
import { AtkinsonHyperlegible_700Bold } from '@expo-google-fonts/atkinson-hyperlegible/700Bold';
import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { Fredoka_700Bold } from '@expo-google-fonts/fredoka/700Bold';
import { NunitoSans_400Regular } from '@expo-google-fonts/nunito-sans/400Regular';
import { NunitoSans_700Bold } from '@expo-google-fonts/nunito-sans/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { startFeel } from '../feel/director';
import { bootstrapStore, useApp } from '../state/store';
import { color } from '../ui/theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    NunitoSans_400Regular,
    NunitoSans_700Bold,
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
  });
  const hydrated = useApp((s) => s.hydrated);
  // Opens the learner's saved data on the client (the web export renders once in Node first).
  useEffect(() => {
    void bootstrapStore();
    startFeel();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {fontsLoaded && hydrated ? (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.paper } }} />
      ) : (
        <View style={{ flex: 1, backgroundColor: color.paper }} />
      )}
    </SafeAreaProvider>
  );
}
