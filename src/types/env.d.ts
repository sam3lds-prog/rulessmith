// Minimal typing for build-time environment variables (Expo inlines EXPO_PUBLIC_*).
declare const process: { env: Record<string, string | undefined> };
