# Vynyl Record — Android (PWA) handoff

React 19 + Vite 8 + Tailwind v4 + three.js. Runs as an installable Android PWA.

## Run
pnpm install && pnpm dev     # pnpm build -> dist/ (deploy over HTTPS to install on Android)

## Map
- src/App.tsx — app shell: bottom tabs (Studio / Master Vault), Player overlay. Full-screen on phones, Android device frame on wide screens.
- src/screens/Studio.tsx — mic recording / file import, vinyl preset + appearance selection, pressing.
- src/screens/Vault.tsx — saved records list.
- src/screens/Player.tsx — playback, seek, label photo (add/replace/remove).
- src/components/Turntable.tsx — three.js turntable: spinning record, label photo texture, tonearm (lower on play, tracks progress, lifts on seek, rests on pause/end).
- src/lib/dsp.ts — vinyl DSP (saturation, wow, flutter, noise, crackle, pops) + WAV export.
- src/lib/db.ts — IndexedDB persistence (records, audio, label photos).
- public/manifest.webmanifest, public/sw.js, public/icon.svg — PWA install + offline.

## Native APK
Wrap with Capacitor: `npx cap init`, `npx cap add android`, add RECORD_AUDIO permission to AndroidManifest.xml, `pnpm build && npx cap sync`.

## Notes
- vite.config.ts imports `.figma/make/site.json` (page title/meta). Keep the hidden `.figma/` folder when copying the project, or remove that import and the `figmaSiteConfiguration(...)` plugin line and set `<title>` in index.html directly.
- The other `figma*` plugins in vite.config.ts are dev-only helpers for Figma Make and can be safely deleted outside it.
