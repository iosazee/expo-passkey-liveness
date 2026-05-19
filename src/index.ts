/**
 * Guard rail fallback — use platform-specific imports instead.
 *
 * 📱 React Native / Expo: import from "expo-passkey-liveness/native"
 * 🌐 Web / Browser:       import from "expo-passkey-liveness/web"
 * 🖥️ Node.js Server:      import from "expo-passkey-liveness/server"
 */

declare const _guard: never;
export const expoPasskeyLiveness = _guard;
