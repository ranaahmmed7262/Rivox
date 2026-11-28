import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform,
  SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import CallScreen from './CallScreen';
import ProfileScreen from './ProfileScreen';
import { RivoxCall, RivoxCallType, startRivoxCall, updateRivoxCallStatus } from '../lib/calls';

type Profile = { id: string; display_name: string; rivox_id: string };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; created_at: string };
type Thread = { id: string; person: Profile; lastMessage?: string };

const accent = '#6C63FF';

export default function ChatScreen({ userId, onSignOut }: { userId: string; onSignOut: () => void }) {
  const [contacts, setContacts] = useState<Profile[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeCall, setActiveCall] = useState<RivoxCall | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const loadThreads = useCallback(async () => {
    const { data: memberships, error } = await supabase
      .from('conversation_members').select('conversation_id')
      .eq('user_id', userId);
    if (error) throw error;
    const ids = (memberships || []).map(x => x.conversation_id);
    if (!ids.length) { setThreads([]); return; }

    const { data: conversations, error: convError } = await supabase
      .from('conversations').select('id').in('id', ids);
    if (convError) throw convError;
    const validIds = (conversations || []).map(x => x.id);
    const { data: otherMembers, error: memberError } = await supabase
      .from('conversation_members').select('conversation_id,user_id')
      .in('conversation_id', validIds).neq('user_id', userId);
    if (memberError) throw memberError;
    const personIds = [...new Set((otherMembers || []).map(x => x.user_id))];
    const { data: people, error: peopleError } = await supabase
      .from('profiles').select('id,display_name,rivox_id').in('id', personIds);
    if (peopleError) throw peopleError;
    const { data: latest } = await supabase.from('messages')
      .select('conversation_id,body,created_at').in('conversation_id', validIds)
      .order('created_at', { ascending: false });
    const result: Thread[] = (otherMembers || []).flatMap(member => {
      const person = (people || []).find(p => p.id === member.user_id);
      if (!person) return [];
      return [{
        id: member.conversation_id,
        person,
        lastMessage: latest?.find(m => m.conversation_id === member.conversation_id)?.body,
      }];
    });
    setThreads(result);
  }, [userId]);

  const loadContacts = useCallback(async () => {
    const { data, error } = await supabase.from('profiles')
      .select('id,display_name,rivox_id').neq('id', userId).order('display_name');
    if (error) throw error;
    setContacts(data || []);
  }, [userId]);

  useEffect(() => {
    let alive = true;
    Promise.all([loadThreads(), loadContacts()])
      .catch(error => Alert.alert('RIVOX', error.message))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [loadThreads, loadContacts]);

  useEffect(() => {
    const channel = supabase.channel('rivox-incoming-calls-' + userId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_sessions', filter: 'callee_id=eq.' + userId }, async payload => {
        const call = payload.new as RivoxCall;
        if (call.status !== 'ringing' || activeCall) return;
        const { data: caller } = await supabase.from('profiles').select('display_name').eq('id', call.caller_id).maybeSingle();
        Alert.alert('Incoming RIVOX call', (caller?.display_name || 'A RIVOX user') + ' is calling you.', [
          { text: 'Reject', style: 'destructive', onPress: () => updateRivoxCallStatus(call.id, 'rejected').catch(e => Alert.alert('RIVOX', e.message)) },
          { text: 'Accept', onPress: () => updateRivoxCallStatus(call.id, 'accepted').then(() => setActiveCall(call)).catch(e => Alert.alert('RIVOX', e.message)) },
        ], { cancelable: false });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, activeCall]);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    supabase.from('messages').select('*').eq('conversation_id', active.id)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) Alert.alert('RIVOX', error.message);
        else setMessages(data || []);
      });
    const channel = supabase.channel('rivox-messages-' + active.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: 'conversation_id=eq.' + active.id,
      }, payload => {
        const incoming = payload.new as Message;
        setMessages(current => current.some(m => m.id === incoming.id) ? current : [...current, incoming]);
      }).subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [active?.id]);

  async function openPerson(person: Profile) {
    setBusy(true);
    try {
      const existing = threads.find(t => t.person.id === person.id);
      if (existing) { setActive(existing); setSearch(''); return; }
      const conversationId = createUuid();
      const { error: createError } = await supabase.from('conversations').insert({
        id: conversationId, created_by: userId, is_group: false,
      });
      if (createError) throw createError;
      const { error: membersError } = await supabase.from('conversation_members').insert([
        { conversation_id: conversationId, user_id: userId },
        { conversation_id: conversationId, user_id: person.id },
      ]);
      if (membersError) throw membersError;
      const thread = { id: conversationId, person };
      setThreads(current => [thread, ...current]);
      setActive(thread);
      setSearch('');
    } catch (error) {
      Alert.alert('Could not start chat', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  async function beginCall(callType: RivoxCallType) {
    if (!active || busy || activeCall) return;
    setBusy(true);
    try {
      const call = await startRivoxCall(active.id, active.person.id, callType);
      setActiveCall(call);
    } catch (error) {
      Alert.alert('Could not start call', error instanceof Error ? error.message : 'Please try again.');
    } finally { setBusy(false); }
  }

  async function sendMessage() {
    const body = draft.trim();
    if (!body || !active || busy) return;
    setBusy(true);
    setDraft('');
    const { data, error } = await supabase.from('messages').insert({
      conversation_id: active.id, sender_id: userId, body,
    }).select('*').single();
    if (error) {
      setDraft(body);
      Alert.alert('Message not sent', error.message);
    } else if (data) {
      setMessages(current => current.some(m => m.id === data.id) ? current : [...current, data]);
      setThreads(current => current.map(t => t.id === active.id ? { ...t, lastMessage: body } : t));
    }
    setBusy(false);
  }

  const filtered = contacts.filter(p => {
    const q = search.trim().toLowerCase();
    return q && ((p.display_name || '').toLowerCase().includes(q) || p.rivox_id.toLowerCase().includes(q));
  });

  if (showProfile) return <ProfileScreen userId={userId} onBack={() => setShowProfile(false)} />;

  if (activeCall) return <CallScreen call={activeCall} displayName={active?.person.display_name || 'RIVOX User'} onClose={() => setActiveCall(null)} />;

  if (active) return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#090B18" />
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={() => { setActive(null); setMessages([]); loadThreads().catch(() => {}); }}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.personName}>{active.person.display_name || 'RIVOX User'}</Text>
          <Text style={styles.personId}>{active.person.rivox_id}</Text>
        </View>
        <TouchableOpacity style={styles.callButton} onPress={() => beginCall('audio')} disabled={busy}><Text style={styles.callButtonText}>Voice</Text></TouchableOpacity>
        <TouchableOpacity style={styles.callButton} onPress={() => beginCall('video')} disabled={busy}><Text style={styles.callButtonText}>Video</Text></TouchableOpacity>
      </View>
      <FlatList
        style={{ flex: 1 }} contentContainerStyle={styles.messageList}
        data={messages} keyExtractor={m => m.id}
        renderItem={({ item }) => <View style={[styles.bubble, item.sender_id === userId ? styles.myBubble : styles.theirBubble]}>
          <Text style={styles.messageText}>{item.body}</Text>
          <Text style={styles.messageTime}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>}
        ListEmptyComponent={<Text style={styles.empty}>Say hello and start the conversation.</Text>}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.composer}>
          <TextInput value={draft} onChangeText={setDraft} placeholder="Write a message…" placeholderTextColor="#777B91" style={styles.messageInput} multiline />
          <TouchableOpacity onPress={sendMessage} disabled={!draft.trim() || busy} style={[styles.send, (!draft.trim() || busy) && { opacity: 0.45 }]}>
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#090B18" />
      <View style={styles.header}>
        <View><Text style={styles.brand}>RIVOX</Text><Text style={styles.tagline}>Your Voice, Beyond Borders.</Text></View>
        <View style={{ flexDirection: 'row', gap: 14 }}><TouchableOpacity onPress={() => setShowProfile(true)}><Text style={styles.signOut}>Profile</Text></TouchableOpacity><TouchableOpacity onPress={onSignOut}><Text style={styles.signOut}>Sign out</Text></TouchableOpacity></View>
      </View>
      <Text style={styles.heading}>Messages</Text>
      <TextInput value={search} onChangeText={setSearch} placeholder="Find by name or RIVOX ID" placeholderTextColor="#777B91" style={styles.search} autoCapitalize="none" />
      {search.trim().length > 0 && <FlatList
        data={filtered} keyExtractor={p => p.id} keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <TouchableOpacity style={styles.contact} onPress={() => openPerson(item)}>
          <View style={styles.contactAvatar}><Text style={styles.avatarLetter}>{(item.display_name || 'R').charAt(0).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.personName}>{item.display_name || 'RIVOX User'}</Text><Text style={styles.personId}>{item.rivox_id}</Text></View>
          <Text style={styles.start}>Message ›</Text>
        </TouchableOpacity>}
        ListEmptyComponent={<Text style={styles.empty}>{loading ? 'Loading users…' : 'No users found.'}</Text>}
      />}
      {!search.trim() && <FlatList
        data={threads} keyExtractor={t => t.id}
        refreshing={loading} onRefresh={() => Promise.all([loadThreads(), loadContacts()]).catch(e => Alert.alert('RIVOX', e.message))}
        renderItem={({ item }) => <TouchableOpacity style={styles.contact} onPress={() => setActive(item)}>
          <View style={styles.contactAvatar}><Text style={styles.avatarLetter}>{(item.person.display_name || 'R').charAt(0).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.personName}>{item.person.display_name || 'RIVOX User'}</Text><Text style={styles.preview} numberOfLines={1}>{item.lastMessage || 'Start a conversation'}</Text></View>
          <Text style={styles.personId}>{item.person.rivox_id}</Text>
        </TouchableOpacity>}
        ListEmptyComponent={<View style={styles.emptyWrap}><Text style={styles.emptyTitle}>No chats yet</Text><Text style={styles.empty}>Search for a RIVOX ID above to start messaging.</Text></View>}
      />}
      {busy && <ActivityIndicator color="#8D86FF" style={{ padding: 10 }} />}
      <Text style={styles.footer}>RIVOX • PRIVATE CONNECTIONS</Text>
    </SafeAreaView>
  );
}

function createUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#090B18', paddingHorizontal: 18 },
  header: { paddingTop: 14, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', letterSpacing: 3 },
  tagline: { color: '#969BB5', fontSize: 11, marginTop: 3 },
  signOut: { color: '#C7C2FF', fontWeight: '700', fontSize: 12 },
  heading: { color: '#FFFFFF', fontSize: 23, fontWeight: '800', marginBottom: 15 },
  search: { backgroundColor: '#15182B', borderRadius: 13, paddingHorizontal: 15, paddingVertical: 14, color: '#FFFFFF', borderWidth: 1, borderColor: '#2A2E4A', marginBottom: 12 },
  contact: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#202238', gap: 12 },
  contactAvatar: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#29264E', alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#D5D1FF', fontSize: 17, fontWeight: '800' },
  personName: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  personId: { color: '#969BB5', fontSize: 10, marginTop: 4 },
  start: { color: '#A9A3FF', fontSize: 11, fontWeight: '700' },
  preview: { color: '#969BB5', fontSize: 11, marginTop: 4 },
  emptyWrap: { alignItems: 'center', paddingTop: 65 },
  emptyTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  empty: { color: '#969BB5', textAlign: 'center', fontSize: 12, lineHeight: 19, marginTop: 10, paddingHorizontal: 16 },
  footer: { color: '#555B75', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, textAlign: 'center', paddingVertical: 15 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#202238' },
  back: { color: '#B8B2FF', fontWeight: '700', fontSize: 14 },
  callButton: { backgroundColor: '#252943', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, marginLeft: 6 },
  callButtonText: { color: '#D5D1FF', fontSize: 10, fontWeight: '800' },
  messageList: { paddingVertical: 16, flexGrow: 1, justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', borderRadius: 16, padding: 12, marginVertical: 5 },
  myBubble: { alignSelf: 'flex-end', backgroundColor: '#393477', borderBottomRightRadius: 4 },
  theirBubble: { alignSelf: 'flex-start', backgroundColor: '#191D32', borderBottomLeftRadius: 4 },
  messageText: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  messageTime: { color: '#C1BEDB', fontSize: 9, textAlign: 'right', marginTop: 5 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#202238', gap: 8 },
  messageInput: { flex: 1, backgroundColor: '#15182B', color: '#FFFFFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, maxHeight: 110, fontSize: 14 },
  send: { backgroundColor: accent, borderRadius: 12, paddingHorizontal: 17, paddingVertical: 14 },
  sendText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
});
