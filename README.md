# RIVOX

**Your Voice, Beyond Borders.**

RIVOX is an Android-first communication app built with Expo React Native and Supabase.

## Current status

- [x] Expo React Native Android project scaffold
- [x] RIVOX dark-theme interface
- [x] Dedicated Supabase project and initial database schema
- [x] Email/password sign-up and sign-in screens
- [x] Persistent Supabase auth session on mobile
- [x] Automatic RIVOX ID/profile creation on account registration
- [x] User directory search by display name or RIVOX ID
- [x] One-to-one conversation creation
- [x] Message send/read and realtime message subscription code
- [ ] End-to-end/device testing of registration and chat
- [ ] Presence, typing indicators, attachments, blocking and reporting
- [ ] WebRTC audio calling
- [ ] WebRTC video calling
- [ ] Call signaling, incoming-call notifications and TURN relay
- [ ] Cloud APK build and installation test
- [ ] Production security and privacy review

## Supabase setup

The dedicated RIVOX project is configured in `lib/supabase.ts` with its project URL and publishable client key. The database migration has been applied. The matching schema is documented in [supabase/schema.sql](./supabase/schema.sql).

The mobile app uses the Supabase publishable key only; never put a service-role key in the app. Database tables are protected by Row Level Security.

## Run locally

```bash
npm install
npx expo install --fix
npx expo start
```

For an installable Android APK, use the EAS preview profile:

```bash
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

See the [Expo APK build guide](https://docs.expo.dev/build-reference/apk/).

## Important

Chat implementation has been added but still needs real-device testing with two separate accounts. Audio/video calling is not implemented yet. Camera and microphone permission declarations alone do not enable calls. The calling layer requires WebRTC, authenticated call signaling, STUN/TURN infrastructure, incoming-call notifications, and real-device network testing.

## LiveKit calling integration

The calling branch adds audio/video call controls, incoming-call accept/reject prompts, LiveKit room UI, mic/camera controls, and an authenticated `livekit-token` Edge Function.

Configure these server-only secrets in Supabase Dashboard → Project Settings → Edge Functions → Secrets:

- `LIVEKIT_URL` (the project's `wss://` URL)
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Never put the LiveKit API secret in the Android app or GitHub. The token function validates the signed-in Supabase user and checks call-session participation before issuing a short-lived room token.

LiveKit uses native WebRTC and does not work in Expo Go. Install dependencies and create a new EAS APK after adding the LiveKit Expo plugins. Real-device tests with two separate RIVOX accounts are still required. Push notifications for background incoming calls are not yet implemented.
