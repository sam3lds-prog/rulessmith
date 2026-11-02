import { Archivo_600SemiBold } from '@expo-google-fonts/archivo/600SemiBold';
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold';
import { Archivo_800ExtraBold } from '@expo-google-fonts/archivo/800ExtraBold';
import { AtkinsonHyperlegible_400Regular } from '@expo-google-fonts/atkinson-hyperlegible/400Regular';
import { AtkinsonHyperlegible_700Bold } from '@expo-google-fonts/atkinson-hyperlegible/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrapStore, useApp } from '../state/store';
import { color } from '../ui/theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
  });
  const hydrated = useApp((s) => s.hydrated);
  // Opens the learner's saved data on the client (the web export renders once in Node first).
  useEffect(() => {
    void bootstrapStore();
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
