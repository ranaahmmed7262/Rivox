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