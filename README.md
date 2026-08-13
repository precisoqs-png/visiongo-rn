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

The Anthropic API key is **server-side only** — it's read by
`app/api/coach+api.ts`, which runs on Vercel, and is never bundled into the
client. It must never be added to `app.json`/`app.config.js` `expo.extra`
or any `EXPO_PUBLIC_*` variable — either would ship it in the `.ipa`/`.apk`
and the web bundle, readable by anyone who installs the app.

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) (Step 7) for the full setup: deploying
the API route to Vercel, setting `ANTHROPIC_API_KEY` there, and pointing the
client at that deployment via `EXPO_PUBLIC_COACH_API_URL` in `eas.json`.

## EAS Build

```bash
npm install -g eas-cli
eas login
eas init                                          # links repo to EAS project
eas build --platform ios --profile development   # dev build for physical device
eas build --platform ios --profile production    # production build

# Then either submit separately:
eas submit --platform ios --latest               # upload the latest build to App Store Connect
# ...or build and submit in one step:
eas build --platform ios --profile production --auto-submit
```

The `.github/workflows/eas-build-dev.yml` GitHub Action runs the same
`--auto-submit` flow for the `production` profile, so a build triggered from
Actions goes straight to App Store Connect/TestFlight without a separate
manual `eas submit`. This needs an App Store Connect API key on top of the
usual `EXPO_TOKEN` — see [`DEPLOYMENT.md`](./DEPLOYMENT.md#step-8b--app-store-connect-api-key-for-the-submit-step)
for how to set that up (either uploaded to EAS once via `eas credentials`,
or via `ASC_API_KEY_BASE64`/`ASC_KEY_ID`/`ASC_ISSUER_ID` GitHub secrets).

`eas submit` authenticates with an App Store Connect API key, not with the
`APPLE_ID`/`APPLE_TEAM_ID` env vars — those only matter for interactive
code-signing flows and are unrelated to submission.

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
