import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StatusBar, Text, View } from 'react-native';
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
    };
  }, []);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: '#090B18', alignItems: 'center', justifyContent: 'center' }}>
      <StatusBar barStyle="light-content" backgroundColor="#090B18" />
      <ActivityIndicator color="#8D86FF" size="large" />
      <Text style={{ color: '#A5A9BF', marginTop: 12 }}>Loading RIVOX…</Text>
    </View>;
  }

  if (!session) return <><StatusBar barStyle="light-content" backgroundColor="#090B18" /><AuthScreen recoveryMode={recoveryMode} /></>;

  return <ChatScreen key={session.user.id} userId={session.user.id} onSignOut={async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('RIVOX', error.message);
  }} />;
}
