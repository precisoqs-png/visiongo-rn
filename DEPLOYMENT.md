# VisionGo — Deployment Guide

> **No Mac required.** Every step below works from a browser or GitHub Actions.
> All iOS compilation happens on Expo’s cloud build servers.

> **Need a terminal?** A GitHub Codespace is available for this repo.
> Go to [github.com/codespaces](https://github.com/codespaces), find the
> `visiongo-rn` codespace (or create one), open it, and you have a full
> Linux terminal in your browser — EAS CLI and Node are pre-installed.

---

## Prerequisites

- An iPhone with iOS 16+
- An [expo.dev](https://expo.dev) account (free)
- An [Apple Developer Program](https://developer.apple.com/programs/) membership ($99/year)
  — required for Steps 4 onward (builds that install on a real device)

---

## Step 1 — Create an Expo account and access token

1. Go to [expo.dev](https://expo.dev) and click **Sign Up**
2. After signing in, go to **expo.dev/settings/access-tokens**
3. Click **Create token**, name it `GitHub Actions`, click **Create**
4. **Copy the token immediately** — it’s only shown once

---

## Step 2 — Add secrets to GitHub

Go to **[github.com/precisoqs-png/visiongo-rn/settings/secrets/actions](https://github.com/precisoqs-png/visiongo-rn/settings/secrets/actions)**

Click **New repository secret** and add:

| Secret name | Value |
|---|---|
| `EXPO_TOKEN` | The access token from Step 1 |
| `APPLE_ID` | Your Apple Developer account email |
| `ASC_APP_ID` | App Store Connect app’s numeric Apple ID (10 digits) |
| `APPLE_TEAM_ID` | Your Apple Team ID (from developer.apple.com/account) |

> `APPLE_ID`, `ASC_APP_ID`, and `APPLE_TEAM_ID` are only required for
> production builds that submit to App Store Connect.
> For development builds, only `EXPO_TOKEN` is needed.

---

## Step 3 — Create the Expo project and set the project ID

1. Go to [expo.dev](https://expo.dev) and click **New Project**
2. Name: `visiongo-rn`, slug: `visiongo-rn` — click **Create**
3. On the project page, copy the **Project ID** (it’s a UUID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
4. Go to **[github.com/precisoqs-png/visiongo-rn/blob/main/app.json](https://github.com/precisoqs-png/visiongo-rn/blob/main/app.json)**
5. Click the **pencil icon** (Edit this file)
6. Find `"projectId": ""` and paste your UUID between the quotes
7. Scroll down, click **Commit changes** with message `chore: add EAS project ID`

---

## Step 4 — Register your iPhone as a test device (browser only)

1. Go to **expo.dev/accounts/[your-username]/projects/visiongo-rn/devices**
2. Click **Register a device**
3. Expo shows a URL — open that URL on your iPhone in **Safari**
4. Follow the prompt to install the device profile
   (Settings will ask you to install it — tap Allow)
5. Your iPhone’s UDID is now registered with your Apple Developer account

You only need to do this once per device.

---

## Step 5 — Trigger a development build (browser only)

1. Go to **[github.com/precisoqs-png/visiongo-rn/actions](https://github.com/precisoqs-png/visiongo-rn/actions)**
2. Click **EAS Build** in the left sidebar
3. Click **Run workflow** (top right)
4. Select profile: **development**
5. Click **Run workflow**

The workflow authenticates with Expo and queues a build on Expo’s macOS
cloud servers. The GitHub Action itself finishes quickly; the build takes
approximately **20–30 minutes**.

**When the build finishes:**
1. Go to **expo.dev/accounts/[your-username]/projects/visiongo-rn/builds**
2. Find the completed build and click it
3. Scan the QR code with your iPhone in Safari
4. Tap **Install**, then go to:
   **Settings → General → VPN & Device Management → [your Apple ID] → Trust**

You now have the VisionGo dev build installed. You only need to repeat this
step when a new native dependency is added.

---

## Step 6 — Daily development (Codespace or local terminal)

Once the dev build is installed on your iPhone, daily coding works from
any terminal — including a GitHub Codespace:

```bash
npm install
npx expo start --dev-client --clear
```

Scan the QR code from inside the **VisionGo** dev app (not Expo Go).
You get hot reload, full New Architecture, and all native modules.

---

## Step 7 — Enable the AI Coach

The AI coach key lives server-side only — it never ships in the `.ipa`.

1. Get an API key at [console.anthropic.com](https://console.anthropic.com)
2. Go to **expo.dev/accounts/[your-username]/projects/visiongo-rn/secrets**
3. Click **Add a new secret**
4. Name: `ANTHROPIC_API_KEY`, Value: your `sk-ant-…` key
5. Click **Save**

The secret is injected automatically into all subsequent EAS builds.
If it’s not set, the coach silently falls back to a stub response —
the app never crashes.

**To test the coach in a Codespace or local dev session:**
```bash
# .env is already in .gitignore
echo 'ANTHROPIC_API_KEY=sk-ant-YOUR-KEY-HERE' > .env
npx expo start --dev-client --clear
```

---

## Step 8 — Production build and App Store submission

### Before running a production build

1. **Fill in `eas.json`** with your real Apple credentials:

   | Field | Where to find it |
   |---|---|
   | `appleId` | Your Apple Developer account email |
   | `ascAppId` | appstoreconnect.apple.com → your app → App Information → Apple ID |
   | `appleTeamId` | developer.apple.com/account → Membership Details → Team ID |

2. **Make sure all four GitHub Secrets are set** (Step 2 above)

3. **Complete App Store Connect metadata** — all ready-to-paste text is in
   [`STORE_METADATA.md`](./STORE_METADATA.md)

4. **Checklist before review submission:**
   - [ ] Real 1024×1024 app icon (no transparency)
   - [ ] Screenshots at 6.9" and 5.5" sizes (min 3 each)
   - [ ] Privacy Policy URL live: `https://precisoqs-png.github.io/visiongo-rn/privacy-policy.html`
   - [ ] Support URL live: `https://precisoqs-png.github.io/visiongo-rn/`
   - [ ] App Privacy questionnaire completed in App Store Connect

### Trigger the production build

1. Go to **[github.com/precisoqs-png/visiongo-rn/actions](https://github.com/precisoqs-png/visiongo-rn/actions)**
2. Click **EAS Build** → **Run workflow**
3. Select profile: **production**
4. Click **Run workflow**

EAS builds the signed `.ipa` and auto-submits it to App Store Connect.
The build appears in **TestFlight** within 15 minutes of the build completing.

---

## Quick reference

| Task | How |
|---|---|
| Trigger any build | GitHub Actions → EAS Build → Run workflow |
| Check build status | expo.dev → project → Builds |
| Install dev build on iPhone | Scan QR from expo.dev build page |
| Add EAS secret (AI key etc.) | expo.dev → project → Secrets |
| Register a new test device | expo.dev → project → Devices |
| Edit any file without a terminal | GitHub → file → pencil icon |
| Get a terminal | [github.com/codespaces](https://github.com/codespaces) → visiongo-rn |
