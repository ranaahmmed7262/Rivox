# RIVOX

**Your Voice, Beyond Borders.**

RIVOX is an Android-first communication app project. The first milestone is a mobile UI foundation; account services and real-time calling are not yet connected.

## Current status

- [x] Expo React Native Android project scaffold
- [x] RIVOX dark-theme starter interface
- [x] Android app identity and camera/microphone permission declarations
- [x] Cloud APK build profile
- [ ] Authentication and user profiles
- [ ] User directory and presence
- [ ] WebRTC audio calling
- [ ] WebRTC video calling
- [ ] Call signaling and incoming-call notifications
- [ ] TURN relay configuration and connectivity testing
- [ ] Call history and production security review

## Build an installable APK

Install Node.js and the Expo/EAS CLI, then run:

```bash
npm install
npx expo install --fix
npx eas-cli login
npx eas-cli build --platform android --profile preview
```

The completed cloud build provides an APK download link. See the [Expo APK build guide](https://docs.expo.dev/build-reference/apk/).

## Calling architecture

The planned calling layer is WebRTC with an authenticated signaling service and STUN/TURN infrastructure. Microphone/camera permission declarations alone do not enable calling. Do not publish this preview as a working calling app until signaling, TURN, authentication, privacy controls, and real-device call tests are implemented.

## Security

Never commit service-role keys, private API keys, signing credentials, or TURN credentials to this repository. Use server-side secrets and short-lived credentials for production calling.