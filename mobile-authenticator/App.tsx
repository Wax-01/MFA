import { HankenGrotesk_300Light } from '@expo-google-fonts/hanken-grotesk/300Light';
import { HankenGrotesk_400Regular } from '@expo-google-fonts/hanken-grotesk/400Regular';
import { HankenGrotesk_500Medium } from '@expo-google-fonts/hanken-grotesk/500Medium';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import AuthenticatorScreen from './src/AuthenticatorScreen';
import AuthScreen, { Session } from './src/AuthScreen';
import Dashboard from './src/Dashboard';
import { color } from './src/theme';

// Un solo proyecto Expo: el celular es el Authenticator y el navegador es la app Kawase.
// En web, /?authenticator abre el Authenticator para probar sin teléfono.
const showAuthenticator = Platform.OS !== 'web' || globalThis.location?.search.includes('authenticator');

export default function App() {
  // Solo se cargan los 3 pesos usados (no la familia completa).
  const [fontsLoaded] = useFonts({ HankenGrotesk_300Light, HankenGrotesk_400Regular, HankenGrotesk_500Medium });
  const [session, setSession] = useState<Session | null>(null);

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: color.ink }} />;

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: color.ink }}>
        <StatusBar style="light" />
        {showAuthenticator ? (
          <AuthenticatorScreen />
        ) : session ? (
          <Dashboard session={session} onLogout={() => setSession(null)} />
        ) : (
          <AuthScreen onAuthenticated={setSession} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
