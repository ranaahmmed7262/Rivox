import { supabase } from './supabase';

export type RivoxCallType = 'audio' | 'video';
export type RivoxCallStatus = 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed';

export type RivoxCall = {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  call_type: RivoxCallType;
  status: RivoxCallStatus;
  created_at: string;
};

export type LiveKitCredentials = {
  serverUrl: string;
  participantToken: string;
};

export async function startRivoxCall(
  conversationId: string,
  calleeId: string,
  callType: RivoxCallType,
): Promise<RivoxCall> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError || new Error('Please sign in again.');

  const { data, error } = await supabase
    .from('call_sessions')
    .insert({
      conversation_id: conversationId,
      caller_id: authData.user.id,
      callee_id: calleeId,
      call_type: callType,
    })
    .select('id,conversation_id,caller_id,callee_id,call_type,status,created_at')
    .single();

  if (error) throw error;
  return data as RivoxCall;
}

export async function updateRivoxCallStatus(
  callId: string,
  status: RivoxCallStatus,
): Promise<void> {
  const { error } = await supabase
    .from('call_sessions')
    .update({ status })
    .eq('id', callId);
  if (error) throw error;
}

export async function getLiveKitCredentials(callId: string): Promise<LiveKitCredentials> {
  const { data, error } = await supabase.functions.invoke('livekit-token', {
    body: { callId },
  });
  if (error) throw error;
  if (!data?.serverUrl || !data?.participantToken) {
    throw new Error(data?.error || 'The calling service did not return a connection token.');
  }
  return data as LiveKitCredentials;
}
