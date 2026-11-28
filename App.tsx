import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StatusBar, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { registerGlobals } from '@livekit/react-native';
import AuthScreen from './components/AuthScreen';
import ChatScreen from './components/ChatScreen';
import { supabase } from './lib/supabase';

registerGlobals();

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    const handleRecoveryUrl = async (url: string) => {
      if (!url.includes('type=recovery')) return;
      try {
        const parsed = new URL(url);
        const params = new URLSearchParams(parsed.hash.replace(/^#/, ''));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (error) throw error;
          setSession(data.session);
        } else {
          const { data, error } = await supabase.auth.exchangeCodeForSession(url);
          if (error) throw error;
          setSession(data.session);
        }
        setRecoveryMode(true);
      } catch (error) {
        Alert.alert('Password recovery', error instanceof Error ? error.message : 'Could not open recovery link.');
      }
    };
    Linking.getInitialURL().then(url => { if (url) void handleRecoveryUrl(url); });
    const urlListener = Linking.addEventListener('url', event => { void handleRecoveryUrl(event.url); });
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) Alert.alert('RIVOX', error.message);
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
      setSession(nextSession);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
      urlListener.remove();
    };
  }, []);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: '#090B18', alignItems: 'center', justifyContent: 'center' }}>
      <StatusBar barStyle="light-content" backgroundColor="#090B18" />
      <ActivityIndicator color="#8D86FF" size="large" />
      <Text style={{ color: '#A5A9BF', marginTop: 12 }}>Loading RIVOX…</Text>
    </View>;
  }

  if (recoveryMode || !session) return <><StatusBar barStyle="light-content" backgroundColor="#090B18" /><AuthScreen recoveryMode={recoveryMode} onRecoveryComplete={() => setRecoveryMode(false)} /></>;

  return <ChatScreen key={session.user.id} userId={session.user.id} onSignOut={async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('RIVOX', error.message);
  }} />;
}
