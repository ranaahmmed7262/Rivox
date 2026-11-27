import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { supabase } from '../lib/supabase';

const accent = '#6C63FF';

export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      Alert.alert('Check your email', 'Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      Alert.alert('Name required', 'Enter your display name.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { display_name: name.trim() } },
        });
        if (error) throw error;
        if (!data.session) {
          Alert.alert('Verify your email', 'Your RIVOX account has been created. Check your inbox and verify your email, then sign in.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
      }
    } catch (error) {
      Alert.alert('RIVOX', error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.brandMark}><Text style={styles.brandMarkText}>R</Text></View>
      <Text style={styles.brand}>RIVOX</Text>
      <Text style={styles.tagline}>Your Voice, Beyond Borders.</Text>
      <View style={styles.card}>
        <Text style={styles.title}>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</Text>
        <Text style={styles.subtitle}>{mode === 'signin' ? 'Sign in to continue to RIVOX' : 'Join RIVOX and stay connected'}</Text>
        {mode === 'signup' && (
          <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor="#8589A0" style={styles.input} autoCapitalize="words" />
        )}
        <TextInput value={email} onChangeText={setEmail} placeholder="Email address" placeholderTextColor="#8589A0" style={styles.input} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <TextInput value={password} onChangeText={setPassword} placeholder="Password (min. 6 characters)" placeholderTextColor="#8589A0" style={styles.input} secureTextEntry autoCapitalize="none" />
        <TouchableOpacity onPress={submit} disabled={busy} style={[styles.primary, busy && { opacity: 0.65 }]}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')} style={styles.switch}>
          <Text style={styles.switchText}>{mode === 'signin' ? "New to RIVOX? " : 'Already have an account? '}
            <Text style={styles.switchAccent}>{mode === 'signin' ? 'Create account' : 'Sign in'}</Text>
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.footer}>SECURE CONNECTIONS • RIVOX</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#090B18', justifyContent: 'center', padding: 24 },
  brandMark: { alignSelf: 'center', width: 62, height: 62, borderRadius: 20, backgroundColor: '#29264E', borderWidth: 1, borderColor: accent, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  brandMarkText: { color: '#D5D1FF', fontSize: 34, fontWeight: '900' },
  brand: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', letterSpacing: 4, textAlign: 'center' },
  tagline: { color: '#969BB5', fontSize: 12, textAlign: 'center', marginTop: 5, marginBottom: 30 },
  card: { backgroundColor: '#121529', borderRadius: 22, borderWidth: 1, borderColor: '#292D49', padding: 22 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  subtitle: { color: '#969BB5', fontSize: 12, marginTop: 7, marginBottom: 20 },
  input: { backgroundColor: '#0B0E1D', borderWidth: 1, borderColor: '#303450', color: '#FFFFFF', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 12, fontSize: 14 },
  primary: { backgroundColor: accent, padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 5 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  switch: { paddingTop: 20, alignItems: 'center' },
  switchText: { color: '#A5A9BF', fontSize: 12 },
  switchAccent: { color: '#B8B2FF', fontWeight: '800' },
  footer: { color: '#555B75', fontSize: 9, textAlign: 'center', marginTop: 28, letterSpacing: 1.5 },
});
