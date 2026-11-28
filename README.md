# RIVOX

**Your Voice, Beyond Borders.**

RIVOX is an Android-first communication app built with Expo React Native, Supabase, and LiveKit.

## Current implementation

- [x] Expo React Native Android project scaffold and dark theme
- [x] Supabase email/password authentication and persistent sessions
- [x] Automatic RIVOX ID/profile creation
- [x] User directory search by display name or RIVOX ID
- [x] One-to-one conversations and realtime message subscriptions
- [x] LiveKit audio/video calling UI and authenticated token Edge Function
- [x] Call signaling with incoming in-app accept/reject controls
- [x] Android APK build through EAS Build
- [x] EAS Update configuration for compatible JavaScript/UI updates
- [x] GitHub Actions workflow to publish preview-channel OTA updates from main

## OTA updates

The app uses Expo Updates with runtime version policy `appVersion` and the EAS project configured in `app.json`.

Changes to JavaScript and UI files under `App.tsx`, `components/`, `lib/`, and `assets/` are published to the `preview` channel automatically after they reach `main`. Installed preview builds check for updates when launched; a downloaded update is applied on the next app restart.

Native changes (new native modules, permissions, Expo config plugins, Android/iOS configuration, or native dependency changes) require a new EAS build and installation. Increase the app version when intentionally changing the native runtime so incompatible OTA updates cannot be applied.

The current already-built APK predates this Expo Updates configuration. Install the first APK built from this configuration once to enable OTA updates on that device.

## Supabase setup

The mobile app uses the Supabase publishable key only. Never put a service-role key or LiveKit API secret in the Android app or GitHub.

Configure these server-only secrets in Supabase Dashboard → Project Settings → Edge Functions → Secrets:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

The `livekit-token` Edge Function validates the signed-in Supabase user and call-session participation before issuing a short-lived LiveKit room token.

## Build

Use the EAS preview profile for an installable APK:

```bash
npx eas-cli@latest build --platform android --profile preview
```

The production profile creates an Android App Bundle for Google Play.

## Testing still required

Real-device testing with two separate RIVOX accounts is required for registration, messaging, audio/video calls, network changes, and OTA delivery. Background push notifications, attachments, group messaging/calling, presence, blocking/reporting, and production privacy/security review remain future work.
