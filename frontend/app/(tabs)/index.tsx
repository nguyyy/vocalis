// frontend/app/sign-in.tsx
import React, { useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { AuthButton } from '@/components/ui/AuthButton';
import { signInWithGoogle } from '@/services/authService';


export default function SignIn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  async function handleGoogle() {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      // on success, _layout.tsx will redirect you into the tabs
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <AuthButton onPress={handleGoogle} loading={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, justifyContent:'center', alignItems:'center', padding:16 },
  error:     { color:'red', marginBottom:8 },
});
