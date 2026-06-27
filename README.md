# VisionGo

A React Native goal-tracking app built with Expo 52, Expo Router v4, and Zustand.

## Stack

- **Expo SDK 52** — New Architecture enabled
- **Expo Router v4** — file-based navigation
- **Zustand** — state management with AsyncStorage persistence
- **expo-notifications** — goal reminders (Daily / Weekly / Monthly)
- **react-native-reanimated 3.16** — animated board and onboarding transitions
- **react-native-svg** — progress rings
- **Claude AI coach** — via Anthropic Messages API (falls back to stub if no key)

## Setup

```bash
npm install
npx expo-doctor@latest   # verify dependency alignment
npx expo install --fix   # auto-fix any version mismatches
npx expo start --clear
```

Scan the QR code with the **Expo Go** app on your iPhone (same Wi-Fi network).

## Enabling the real AI coach

The coach falls back to a stub if no API key is configured. To use the real Claude model:

1. Get an API key at [console.anthropic.com](https://console.anthropic.com)
2. Add to `app.json` under `expo.extra`:

```json
"extra": {
  "anthropicKey": "sk-ant-..."
}
```

> **Never commit the key.** For production builds use EAS Secrets instead:
> ```bash
> eas secret:create --scope project --name ANTHROPIC_KEY --value sk-ant-...
> ```
> Then reference it in `eas.json` build profiles via `env: { "ANTHROPIC_KEY": "$ANTHROPIC_KEY" }`
> and read it in `app.config.js` (rename `app.json` → `app.config.js`) to inject into `extra`.

## EAS Build

```bash
npm install -g eas-cli
eas login
eas init                                          # links repo to EAS project
eas build --platform ios --profile development   # dev build for physical device
eas build --platform ios --profile production    # production build for TestFlight
eas submit --platform ios --latest               # upload to App Store Connect
```

## Screens

| Route | Description |
|---|---|
| `/onboarding` | 5-step animated onboarding (year, motto, goals) |
| `/(tabs)/board` | Radial or grid goal board with whole-year / by-month views |
| `/(tabs)/pair` | AI-generated goal synergy suggestions |
| `/(tabs)/tasks` | Aggregated tasks grouped by due date |
| `/(tabs)/settings` | Theme picker + notification settings |
| `/goal/[id]` | Goal detail: measurables, progress, CoachChat |
| `/completed` | Radial display of completed goals |

## Smoke test checklist

Run through these after every significant change:

- [ ] Fresh launch → onboarding step 1 appears
- [ ] Complete all 5 onboarding steps → board renders with seeded goals
- [ ] Tap a goal → detail screen loads with measurables
- [ ] Add one of each measurable type (check, number, ladder)
- [ ] CoachChat → response arrives (stub: ~900ms, real: varies)
- [ ] Board → switch radial ↔ grid → switch whole year ↔ by month
- [ ] Pair tab → synergy text loads
- [ ] Tasks tab → groups render
- [ ] Settings → cycle all 5 themes → board re-renders
- [ ] Force-quit → relaunch → goals and theme persisted via AsyncStorage
- [ ] Settings → Notifications → enable master → enable a goal → verify system prompt appears

## Bundle identifiers

| Platform | ID |
|---|---|
| iOS | `com.visiongo.app` |
| Android | `com.visiongo.app` |
