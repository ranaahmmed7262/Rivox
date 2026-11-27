import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import AuthScreen from './components/AuthScreen';
import { supabase } from './lib/supabase';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ display_name: string; rivox_id: string } | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) Alert.alert('RIVOX', error.message);
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setProfile(null);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user.id) return;
    supabase.from('profiles').select('display_name,rivox_id').eq('id', session.user.id).single()
      .then(({ data, error }) => {
        if (error) {
          // The profile trigger may need a moment after account creation.
          console.warn('Profile load:', error.message);
          return;
        }
        setProfile(data);
      });
  }, [session?.user.id]);

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('RIVOX', error.message);
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color="#8D86FF" size="large" /><Text style={styles.loadingText}>Loading RIVOX…</Text></View>;
  }
  if (!session) return <><StatusBar barStyle="light-content" backgroundColor="#090B18" /><AuthScreen /></>;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#090B18" />
      <View style={styles.header}>
        <View><Text style={styles.brand}>RIVOX</Text><Text style={styles.tagline}>Your Voice, Beyond Borders.</Text></View>
        <View style={styles.avatar}><Text style={styles.avatarText}>{(profile?.display_name || session.user.email || 'R').charAt(0).toUpperCase()}</Text></View>
      </View>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>YOU'RE CONNECTED</Text>
        <Text style={styles.heroTitle}>Welcome{profile?.display_name ? ', ' + profile.display_name : ' to RIVOX'}.</Text>
        <Text style={styles.heroBody}>Your account is active. Your RIVOX identity is ready.</Text>
      </View>
      <View style={styles.profileCard}>
        <Text style={styles.label}>YOUR RIVOX ID</Text>
        <Text style={styles.rivoxId}>{profile?.rivox_id || 'Preparing your ID…'}</Text>
        <Text style={styles.email}>{session.user.email}</Text>
      </View>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Next up: Messaging</Text>
        <Text style={styles.noticeBody}>Your secure account and profile are connected. One-to-one chat and audio/video calling are the next development steps.</Text>
      </View>
      <TouchableOpacity style={styles.signOut} onPress={signOut}><Text style={styles.signOutText}>Sign Out</Text></TouchableOpacity>
      <Text style={styles.footer}>RIVOX • PRIVATE CONNECTIONS</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#090B18', padding: 22 },
  loading: { flex: 1, backgroundColor: '#090B18', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#A5A9BF', marginTop: 12 },
  header: { paddingTop: 14, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', letterSpacing: 3 },
  tagline: { color: '#969BB5', fontSize: 11, marginTop: 3 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#29264E', borderWidth: 1, borderColor: '#6C63FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#D5D1FF', fontSize: 18, fontWeight: '800' },
  hero: { marginTop: 20, padding: 22, borderRadius: 22, backgroundColor: '#171832', borderWidth: 1, borderColor: '#29294E' },
  eyebrow: { color: '#9E98FF', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  heroTitle: { color: '#FFFFFF', fontSize: 25, fontWeight: '800', marginTop: 12 },
  heroBody: { color: '#B4B6CB', fontSize: 13, lineHeight: 20, marginTop: 9 },
  profileCard: { marginTop: 18, backgroundColor: '#121529', borderWidth: 1, borderColor: '#292D49', borderRadius: 18, padding: 20, alignItems: 'center' },
  label: { color: '#969BB5', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  rivoxId: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', letterSpacing: 3, marginTop: 9 },
  email: { color: '#969BB5', fontSize: 12, marginTop: 9 },
  notice: { marginTop: 18, backgroundColor: '#111426', borderRadius: 16, padding: 18 },
  noticeTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  noticeBody: { color: '#969BB5', fontSize: 12, lineHeight: 19, marginTop: 7 },
  signOut: { marginTop: 22, borderRadius: 12, borderWidth: 1, borderColor: '#454968', padding: 14, alignItems: 'center' },
  signOutText: { color: '#D7D5FF', fontSize: 13, fontWeight: '800' },
  footer: { color: '#555B75', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, textAlign: 'center', marginTop: 'auto', paddingTop: 22 },
});
