# VisionGo — Developer Deployment Guide

Everything you need to go from a fresh clone to a build running on your iPhone, and eventually to the App Store. Do these steps in order.

---

## Prerequisites

- Node.js 18+ and npm installed
- An iPhone with iOS 16+
- An [expo.dev](https://expo.dev) account (free)
- An [Apple Developer Program](https://developer.apple.com/programs/) membership ($99/year) — required for Steps D onward

---

## Step A — Install EAS CLI

```bash
npm install -g eas-cli
```

Verify:
```bash
eas --version  # should be 16.x or higher
```

---

## Step B — Log in to Expo

```bash
eas login
```

If you don’t have an Expo account, create one at [expo.dev](https://expo.dev) — it’s free.

---

## Step C — Link the repo to EAS (run once)

```bash
eas init
```

This command:
- Creates a project on expo.dev linked to this repo
- Writes the `projectId` into `app.json` under `expo.extra.eas.projectId`

**Commit the result:**
```bash
git add app.json
git commit -m "chore: add EAS project ID"
git push
```

---

## Step D — Register your iPhone as a test device

Make sure your iPhone is nearby and connected to Wi-Fi.

```bash
eas device:create
```

EAS will display a URL. Open it on your iPhone in Safari and follow the prompt to install the device profile. This registers your iPhone’s UDID with your Apple Developer account so development builds can be installed on it.

---

## Step E — Build the development client (first build)

```bash
eas build --profile development --platform ios
```

- This build runs on EAS cloud servers — no Xcode required
- First build takes approximately 20–30 minutes
- When complete, EAS prints a QR code. Open it on your iPhone in Safari and tap **Install**
- After install: go to **Settings → General → VPN & Device Management → [your Apple ID] → Trust**

You only need to repeat this step if you add a new native dependency (one not already in the Expo SDK).

---

## Step F — Daily development workflow

Once the dev build is installed on your iPhone:

```bash
npm install
npx expo start --dev-client --clear
```

Scan the QR code from inside the **VisionGo** dev app (not Expo Go). You now have:
- Hot reload on save
- Full New Architecture (Fabric + JSI)
- expo-notifications, expo-crypto, and all native modules

---

## Step G — Enable the AI Coach

The AI coach calls your own `/api/coach` server route, which reads `ANTHROPIC_API_KEY` from a server-side environment variable. The key never ships in the `.ipa`.

Get an API key at [console.anthropic.com](https://console.anthropic.com), then set it as an EAS Secret:

```bash
eas secret:create --scope project --name ANTHROPIC_API_KEY --value sk-ant-YOUR-KEY-HERE
```

This secret is injected automatically into all EAS builds and server environments. You do **not** put it in `.env`, `app.json`, or anywhere in the repo.

To test the coach locally during development:

```bash
# Create a local .env file (already gitignored)
echo 'ANTHROPIC_API_KEY=sk-ant-YOUR-KEY-HERE' > .env
npx expo start --dev-client --clear
```

If `ANTHROPIC_API_KEY` is not set, the coach silently falls back to a stub response — the app never crashes.

---

## Step H — Before submitting to the App Store

### 1. Fill in your Apple credentials in `eas.json`

Open `eas.json` and replace the placeholders in `submit.production.ios`:

| Field | Where to find it |
|---|---|
| `appleId` | Your Apple Developer account email |
| `ascAppId` | App Store Connect → your app → General → App Information → Apple ID (10-digit number) |
| `appleTeamId` | [developer.apple.com/account](https://developer.apple.com/account) → Membership Details → Team ID |

### 2. Production build + auto-submit

```bash
eas build --profile production --platform ios --auto-submit
```

This:
- Builds a signed `.ipa` on EAS servers
- Automatically uploads it to App Store Connect via `eas submit`
- The build appears in **TestFlight** within 15 minutes

### 3. Complete App Store Connect metadata

All ready-to-paste text is in [`STORE_METADATA.md`](./STORE_METADATA.md).

Before submitting for review you also need:
- [ ] Real 1024×1024 app icon (no transparency)
- [ ] Screenshots at 6.9" and 5.5" sizes (min 3 each)
- [ ] Privacy Policy URL live at `https://precisoqs-png.github.io/visiongo-rn/privacy-policy.html`
- [ ] Support URL live at `https://precisoqs-png.github.io/visiongo-rn/`
- [ ] App Privacy questionnaire filled in App Store Connect

---

## Quick reference

| Task | Command |
|---|---|
| Start dev server | `npx expo start --dev-client --clear` |
| New dev build | `eas build --profile development --platform ios` |
| Preview build (internal TestFlight) | `eas build --profile preview --platform ios` |
| Production build + submit | `eas build --profile production --platform ios --auto-submit` |
| Set a secret | `eas secret:create --scope project --name KEY --value value` |
| List secrets | `eas secret:list` |
| Register new test device | `eas device:create` |
| Check build status | `eas build:list` |
