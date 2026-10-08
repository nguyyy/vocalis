import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';

interface Props {
  onPress: () => void;
  loading?: boolean;
}

export function AuthButton({ onPress, loading = false }: Props) {
  return (
    <Pressable style={styles.button} onPress={onPress} disabled={loading}>
      {loading
        ? <ActivityIndicator />
        : <Text style={styles.text}>Continue with Google</Text>
      }
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,           // Android shadow
    shadowColor: '#000',    // iOS shadow
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginVertical: 8,
  },
  text: {
    fontSize: 16,
    color: '#444',
  },
});
