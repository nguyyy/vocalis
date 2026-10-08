/*
// frontend/services/authService.ts
import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import { supabase } from '../utils/supabase';

export async function signInWithGoogle() {
  // expo-constants may return scheme as string | string[] | undefined
  const rawScheme = Constants.expoConfig?.scheme;
  const scheme =
    Array.isArray(rawScheme) ? rawScheme[0] :
    rawScheme ?? 'frontend';    // fallback to your default app scheme

  // Build the redirect URI for the OAuth flow
  const redirectUri = AuthSession.makeRedirectUri({ scheme });

  // Kick off Supabase OAuth
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectUri }
  });

  if (error) {
    console.error('Google sign-in error:', error);
    throw error;
  }

  return data;  // contains { session, user }
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('Email sign-in error:', error);
    throw error;
  }
  return data; // contains { session, user }
}

export async function signUpWithEmail(email: string, password: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) {
    console.error('Email sign-up error:', error);
    throw error;
  }
  return data; // contains { user }
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) {
    console.error('Password reset error:', error);
    throw error;
  }
}
  */