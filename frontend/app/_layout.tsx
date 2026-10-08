// frontend/app/_layout.tsx
/*
import React, { useState, useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '../utils/supabase';

export default function RootLayout() {
  // DEV: wipe out any existing session
  useEffect(() => {
    supabase.auth.signOut();
  }, []);

  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  // session: undefined = loading, null = signed-out, Session = signed-in
  const [session, setSession] = useState<null | any | undefined>(undefined);

  useEffect(() => {
    // 1) get initial session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

   const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, newSession) => {
      setSession(newSession);
    });

  // …

    return () => {
      subscription.unsubscribe();
    };

  }, []);

  // wait until both fonts & session are known
  if (!fontsLoaded || session === undefined) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        {!session ? (
         // no session → show sign-in and sign-up
          <>
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
            <Stack.Screen name="sign-up" options={{ headerShown: false }} />
          </>
        ) : (
          // has session → show your tabs + not-found
          <>
            <Stack.Screen name="home" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)"      options={{ headerShown: false }} />
            <Stack.Screen name="+not-found"  options={{ title: 'Oops!' }} />
          </>
        )}
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
*/