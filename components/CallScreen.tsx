import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, SafeAreaView, StatusBar, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import {
  AudioSession, LiveKitRoom, RoomAudioRenderer, VideoTrack,
  isTrackReference, useRoomContext, useTracks,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { getLiveKitCredentials, updateRivoxCallStatus, RivoxCall } from '../lib/calls';
import { supabase } from '../lib/supabase';

export default function CallScreen({
  call,
  displayName,
  onClose,
}: {
  call: RivoxCall;
  displayName: string;
  onClose: () => void;
}) {
  const [credentials, setCredentials] = useState<{ serverUrl: string; participantToken: string } | null>(null);
  const [loadingError, setLoadingError] = useState('');

  useEffect(() => {
    let active = true;
    AudioSession.startAudioSession().catch(error => {
      if (active) setLoadingError(error instanceof Error ? error.message : 'Could not start audio session.');
    });
    let started = false;
    let statusChannel: ReturnType<typeof supabase.channel> | undefined;
    const connect = () => {
      if (started) return;
      started = true;
      getLiveKitCredentials(call.id)
        .then(value => { if (active) setCredentials(value); })
        .catch(error => {
          if (!active) return;
          const message = error instanceof Error ? error.message : 'Could not connect the call.';
          setLoadingError(message);
          Alert.alert('RIVOX Call', message, [{ text: 'OK', onPress: onClose }]);
        });
    };
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (data.user?.id === call.caller_id && call.status === 'ringing') {
        statusChannel = supabase.channel('rivox-call-status-' + call.id)
          .on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'call_sessions',
            filter: 'id=eq.' + call.id,
          }, payload => {
            const status = payload.new.status;
            if (status === 'accepted') connect();
            if (['rejected', 'ended', 'missed'].includes(status)) {
              setLoadingError('The call was not accepted.');
              onClose();
            }
          }).subscribe();
      } else {
        connect();
      }
    }).catch(error => {
      if (active) setLoadingError(error instanceof Error ? error.message : 'Could not verify your account.');
    });
    return () => {
      active = false;
      if (statusChannel) supabase.removeChannel(statusChannel);
      AudioSession.stopAudioSession().catch(() => {});
    };
  }, [call.id]);

  if (loadingError && !credentials) {
    return <CallLoading message={loadingError} onClose={onClose} />;
  }
  if (!credentials) return <CallLoading message="Connecting securely…" onClose={onClose} />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#090B18" />
      <LiveKitRoom
        serverUrl={credentials.serverUrl}
        token={credentials.participantToken}
        connect={true}
        audio={true}
        video={call.call_type === 'video'}
        options={{ adaptiveStream: { pixelDensity: 'screen' } }}
        onDisconnected={() => onClose()}
      >
        <View style={styles.header}>
          <Text style={styles.brand}>RIVOX</Text>
          <Text style={styles.name}>{displayName || 'RIVOX User'}</Text>
          <Text style={styles.callType}>{call.call_type === 'video' ? 'VIDEO CALL' : 'VOICE CALL'}</Text>
        </View>
        {call.call_type === 'video' ? <VideoArea /> : (
          <View style={styles.voiceCenter}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{(displayName || 'R').charAt(0).toUpperCase()}</Text></View>
            <Text style={styles.voiceName}>{displayName || 'RIVOX User'}</Text>
            <Text style={styles.status}>{credentials ? 'Connected to secure call room' : 'Calling… waiting for answer'}</Text>
          </View>
        )}
        <RoomAudioRenderer />
        <CallControls call={call} onClose={onClose} video={call.call_type === 'video'} />
      </LiveKitRoom>
    </SafeAreaView>
  );
}

function VideoArea() {
  const tracks = useTracks([Track.Source.Camera]);
  const videoTracks = tracks.filter(isTrackReference);
  return (
    <View style={styles.videoArea}>
      {videoTracks.length ? videoTracks.map((track: any) => (
        <VideoTrack
          key={track.participant.identity}
          trackRef={track}
          style={styles.videoTile}
        />
      )) : (
        <View style={styles.videoPlaceholder}>
          <Text style={styles.status}>Waiting for camera video…</Text>
        </View>
      )}
    </View>
  );
}

function CallControls({ call, onClose, video }: { call: RivoxCall; onClose: () => void; video: boolean }) {
  const room = useRoomContext();
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(video);
  const [ending, setEnding] = useState(false);

  async function toggleMic() {
    const next = !micOn;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicOn(next);
    } catch (error) {
      Alert.alert('Microphone', error instanceof Error ? error.message : 'Could not change microphone.');
    }
  }

  async function toggleCamera() {
    const next = !cameraOn;
    try {
      await room.localParticipant.setCameraEnabled(next);
      setCameraOn(next);
    } catch (error) {
      Alert.alert('Camera', error instanceof Error ? error.message : 'Could not change camera.');
    }
  }

  async function hangUp() {
    if (ending) return;
    setEnding(true);
    try { await updateRivoxCallStatus(call.id, 'ended'); } catch { /* The room still needs to disconnect. */ }
    await room.disconnect();
    onClose();
  }

  return (
    <View style={styles.controls}>
      <TouchableOpacity style={[styles.control, !micOn && styles.controlOff]} onPress={toggleMic}>
        <Text style={styles.controlText}>{micOn ? 'Mute' : 'Unmute'}</Text>
      </TouchableOpacity>
      {video && (
        <TouchableOpacity style={[styles.control, !cameraOn && styles.controlOff]} onPress={toggleCamera}>
          <Text style={styles.controlText}>{cameraOn ? 'Camera off' : 'Camera on'}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.endCall} onPress={hangUp} disabled={ending}>
        <Text style={styles.endCallText}>{ending ? 'Ending…' : 'End call'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function CallLoading({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#090B18" />
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#8D86FF" />
        <Text style={styles.status}>{message}</Text>
        <TouchableOpacity onPress={onClose} style={styles.endCall}><Text style={styles.endCallText}>Close</Text></TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#090B18', paddingHorizontal: 18 },
  header: { alignItems: 'center', paddingVertical: 24 },
  brand: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: 3 },
  name: { color: '#FFFFFF', fontSize: 21, fontWeight: '800', marginTop: 28 },
  callType: { color: '#A9A3FF', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginTop: 8 },
  voiceCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 116, height: 116, borderRadius: 58, backgroundColor: '#29264E', borderWidth: 2, borderColor: '#6C63FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 44, fontWeight: '900' },
  voiceName: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginTop: 24 },
  status: { color: '#969BB5', fontSize: 12, textAlign: 'center', marginTop: 14 },
  videoArea: { flex: 1, gap: 10, justifyContent: 'center' },
  videoTile: { flex: 1, minHeight: 220, borderRadius: 18, overflow: 'hidden' },
  videoPlaceholder: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', backgroundColor: '#15182B', borderRadius: 18 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 24, flexWrap: 'wrap' },
  control: { backgroundColor: '#252943', paddingHorizontal: 17, paddingVertical: 15, borderRadius: 16 },
  controlOff: { backgroundColor: '#51406A' },
  controlText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  endCall: { backgroundColor: '#D94A62', paddingHorizontal: 20, paddingVertical: 15, borderRadius: 16, marginTop: 10 },
  endCallText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
