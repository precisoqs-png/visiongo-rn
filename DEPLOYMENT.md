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

That's everything development and preview builds need. Production builds
additionally submit to App Store Connect/TestFlight — see **Step 8** for the
extra secrets that requires and the two ways to provide them.

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

The coach has two halves that live in **different places** — mixing them up
is the most common way this silently breaks:

- `ANTHROPIC_API_KEY` and `COACH_SHARED_SECRET` are **server-side** —
  they're read by `app/api/coach+api.ts`, which runs on **Vercel**, not in
  the app. They must be set as **Vercel environment variables**, never as an
  EAS secret or in `app.json`/`eas.json` — either of those would ship the
  key inside the `.ipa`/`.apk` and leak it to every install.
- `EXPO_PUBLIC_COACH_API_URL` and `EXPO_PUBLIC_COACH_SHARED_SECRET` are
  **client-side** — they tell the app *where* the Vercel deployment is and
  let it identify itself to it. `EXPO_PUBLIC_*` vars are always compiled
  into the client bundle and are extractable by anyone with the `.ipa` or
  the web build, so `EXPO_PUBLIC_COACH_SHARED_SECRET` is a speed bump against
  casual/automated abuse of the proxy, not a real secret — see the note
  below on what it does and doesn't stop.

### 7a — Deploy the server to Vercel and set its env vars

1. Get an API key at [console.anthropic.com](https://console.anthropic.com)
2. [Create an Upstash Redis database](https://console.upstash.com) (free
   tier is fine) — this backs the daily usage caps described below
3. Deploy this repo to [vercel.com](https://vercel.com) (it already has
   `vercel.json`; build command is `npm run build:vercel`)
4. In the Vercel project → **Settings → Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your `sk-ant-…` key |
   | `COACH_SHARED_SECRET` | a long random string you generate yourself, e.g. `openssl rand -hex 32` |
   | `UPSTASH_REDIS_REST_URL` | from the Upstash database's REST API tab |
   | `UPSTASH_REDIS_REST_TOKEN` | from the same tab |
   | `ALLOWED_ORIGINS` | *(optional)* comma-separated origins allowed to call this route from a browser, e.g. `https://precisoqs-png.github.io`. Leave unset to skip this check (native requests never send an Origin header anyway, so this only matters for the web build). |

5. Note the deployment's URL (e.g. `https://visiongo-rn.vercel.app`) — you
   need it for the next step.

If `ANTHROPIC_API_KEY` is missing, the route returns a `503` — the coach
does **not** silently fall back to a stub on the server side; that only
happens on the client when it can't reach the server at all (see
`services/coachService.ts`).

**What `COACH_SHARED_SECRET` does and doesn't stop:** the client sends it as
a header on every request, and the server rejects requests missing or
mismatching it. Because it ships inside `EXPO_PUBLIC_COACH_SHARED_SECRET` in
every build, anyone who extracts it from the app can still call the proxy
directly — it stops casual/automated scraping of the endpoint by parties who
haven't gone to that effort, nothing more. The real per-request cost
controls are the server-side daily caps (device + global), which don't rely
on the secret at all.

### 7b — Point the app at it (`eas.json`)

`eas.json`'s `build.<profile>.env` now sets, for each profile:

```json
"EXPO_PUBLIC_COACH_API_URL": "https://visiongo-rn.vercel.app",
"EXPO_PUBLIC_COACH_SHARED_SECRET": "$COACH_SHARED_SECRET"
```

Replace the URL with your actual Vercel deployment URL from Step 7a if it
differs. The `$COACH_SHARED_SECRET` syntax tells EAS to read the value from
an **EAS secret** of that name (not from your shell) — set it once:

```bash
eas secret:create --scope project --name COACH_SHARED_SECRET --value "the-same-value-you-put-in-vercel"
```

Without `EXPO_PUBLIC_COACH_API_URL` set, **native builds throw a loud
configuration error** instead of silently degrading to the offline stub —
see `CoachConfigError` in `services/coachService.ts`. This is deliberate: a
misconfigured production build should be obviously broken in testing, not
indistinguishable from a working one that happens to be offline.

**To test the coach in a Codespace or local dev session** (talks to the
Expo Router API route directly, no Vercel deployment needed):
```bash
# .env is already in .gitignore
echo 'ANTHROPIC_API_KEY=sk-ant-YOUR-KEY-HERE' > .env
echo 'COACH_SHARED_SECRET=dev-only-value' >> .env
echo 'EXPO_PUBLIC_COACH_SHARED_SECRET=dev-only-value' >> .env
npx expo start --dev-client --clear
```

**Note on the GitHub Pages web build:** `deploy-web.yml` publishes a static
export with no server route at all, so `/api/coach` 404s there by design —
that deployment always runs the offline stub, permanently, not as a fallback
for an outage. That URL is also listed as the **Support URL** in App Store
Connect metadata (see Step 8's checklist) — worth knowing before a reviewer
clicks it expecting the same coach behavior as the shipped app.

---

## Step 8 — Production build and App Store submission

A production build does two things: EAS **builds** the signed `.ipa`, then
(because the `production` build profile matches a `production` submit
profile in `eas.json`) the workflow passes `--auto-submit`, which runs
`eas submit` immediately after the build finishes and uploads it to App
Store Connect. No separate manual submit step is needed once this is set
up — but it does need credentials the workflow does not have by default.

### Two kinds of credentials, two different mechanisms

Getting a production build into TestFlight from CI needs **two separate**
sets of credentials, resolved completely differently:

1. **iOS code-signing (distribution certificate + provisioning profile)** —
   needed to *build* the `.ipa` at all. See **Step 8a** below;
   `credentialsSource` in `eas.json` controls where these come from.
2. **App Store Connect API key** — needed to *submit* the built `.ipa`.
   See **Step 8b** below; this is unrelated to code-signing and is resolved
   independently by `eas submit`.

Getting one right without the other still fails — the build succeeds but
the submit step errors, or vice versa.

### Step 8a — iOS code-signing credentials

`eas.json` sets `production.ios.credentialsSource: "remote"`, which uses
signing credentials stored on EAS's servers (set up once via an interactive
`eas credentials` run) rather than files checked into the repo. This is the
same mechanism `development` and `preview` already use — neither sets
`credentialsSource`, so both default to `"remote"` too.

Run this once, interactively, before the first production build:
```bash
eas credentials
# iOS → (select the project) → production → set up a new distribution certificate
```
Until that's done, a production build kicked off from CI will fail at the
credentials step — this document does not generate any certificates for you.

If you'd rather run production builds **locally** with files you manage
yourself (`credentials.json` plus `.p12`/`.mobileprovision`), change
`credentialsSource` to `"local"` in `eas.json` and keep those files
gitignored as usual.

### Step 8b — App Store Connect API key (for the submit step)

`eas submit` authenticates to App Store Connect with an API key — not with
your Apple ID password, and not with `APPLE_ID`/`APPLE_TEAM_ID` (those are
only used for the code-signing side, and only in interactive flows). Pick
**one** of these two options:

**Option A — store the key on EAS (recommended).** Run this once, from any
machine, interactively:
```bash
eas credentials
# iOS → (select the project) → App Store Connect API Key → Add a new key
```
You'll need to have generated an API key first at
**appstoreconnect.apple.com → Users and Access → Integrations → App Store
Connect API** (role: App Manager or above) and downloaded its `.p8` file.
Once uploaded to EAS, CI needs nothing extra — `eas submit` finds it
automatically. This is the same mechanism development/preview builds
already rely on for code-signing credentials, just applied to the ASC key.

**Option B — keep the key in GitHub Secrets instead.** Set these three
repository secrets (Settings → Secrets and variables → Actions):

| GitHub Secret | Value |
|---|---|
| `ASC_API_KEY_BASE64` | Base64 of the downloaded key file — `base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy` on macOS, or `base64 -w0 AuthKey_XXXXXXXXXX.p8` on Linux |
| `ASC_KEY_ID` | The Key ID shown next to the key in App Store Connect |
| `ASC_ISSUER_ID` | The Issuer ID shown at the top of the Integrations → App Store Connect API page |

The workflow decodes this into a temp file and points `eas submit` at it
via `EXPO_ASC_API_KEY_PATH` / `EXPO_ASC_KEY_ID` / `EXPO_ASC_ISSUER_ID`, then
deletes it at the end of the job. If `ASC_API_KEY_BASE64` is unset, this
step is skipped and EAS falls back to Option A automatically — so it's safe
to set up Option A now and revisit Option B later, or never.

The app's numeric App Store Connect ID is already set in
`submit.production.ios.ascAppId` in `eas.json` (`6794743198`) — nothing to
add there. If your App Store Connect app has a different numeric ID, update
that field in `eas.json` to match — the two must agree, or `eas submit` will
try to upload to the wrong app record.

### Optional: Apple ID secrets (interactive/code-signing flows only)

| GitHub Secret | Env var EAS reads | Where to find it |
|---|---|---|
| `APPLE_ID` | `EXPO_APPLE_ID` | Your Apple Developer account email |
| `APPLE_TEAM_ID` | `EXPO_APPLE_TEAM_ID` | developer.apple.com/account → Membership Details → Team ID |

These are wired into the workflow but are not required for the submit step
itself (which uses the ASC API key above); EAS CLI only falls back to them
for interactive Apple-ID/app-specific-password auth, which non-interactive
CI runs never use.

### Before running a production build

1. Resolve **Step 8a** (code-signing) and **Step 8b** (ASC API key) above.
2. **Complete App Store Connect metadata** — all ready-to-paste text is in
   [`STORE_METADATA.md`](./STORE_METADATA.md)
3. **Checklist before review submission:**
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

If Step 8a and 8b are both resolved, EAS builds the signed `.ipa` and then
automatically submits it to App Store Connect. The build typically appears
in **TestFlight** within roughly 15 minutes of the submit step completing
— that part of the timing is Apple's processing, not something this repo
controls.

If only 8a is resolved (or you'd rather submit by hand), you can still run
the `production` build without submitting and upload it yourself afterward:
```bash
eas submit --platform ios --latest
```

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
