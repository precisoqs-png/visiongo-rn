# VisionGo — What Data Leaves the Device

This is a factual summary of what data leaves the device, where it goes, and
what's stored where, as of this branch — for Jesse to rewrite the privacy
policy and App Privacy questionnaire from. **It is not the policy itself**,
and nothing here should be copied into user-facing text verbatim without
review. The current published policy and store metadata are known to be
wrong (it denies having servers, denies storing identifiers, and denies
sending anything but the goal title) — do not treat this document's absence
of caveats as a claim that everything below is fine as-is, just that it's
accurate.

## Where data goes

### 1. `app/api/coach+api.ts` (deployed on Vercel) — Coach chat and Pair

Every message sent from the in-app AI coach (`CoachChat`) or the Pair
screen (`app/(tabs)/pair.tsx`) hits this route, which forwards the request
to **Anthropic's Messages API**. What's included, by call site:

- **`services/coachService.ts`, `CoachGoalContext`** (built in
  `components/goal/CoachChat.tsx`'s `sendText`): the goal's `title`,
  `achieveByDate` (target date), `weeksRemaining`, every measurable/step's
  label/type/target/unit/current value/completion state, every milestone's
  title/kind/target/deadline/commitments/completion history, the full chat
  history for that goal, and the user's `motivation` field ("why this
  matters" note) if they wrote one.
- **`app/(tabs)/pair.tsx`**: the titles of the two goals the user picked
  (nothing else about them — no measurables, milestones, or notes).
- **`services/deviceId.ts`**: a persistent per-install UUID
  (`getDeviceId()`), sent as the `x-device-id` header on every request.
- **(this branch adds)** `x-coach-secret`, a static value baked into the
  client build (`EXPO_PUBLIC_COACH_SHARED_SECRET`) — not user data, but
  worth noting it's sent on every request too.

**What Anthropic receives:** the system prompt (built from the goal context
above) and the message history, per a normal Messages API call. Anthropic's
own retention/training terms govern what happens to that content on their
side — this document doesn't attempt to restate those; link to Anthropic's
current API terms/privacy policy in the rewrite instead of describing them
secondhand here.

**What the Vercel server stores (Upstash Redis):**
- `coach-usage:<date>` — a global request counter, no identifying data.
- `device-usage:<kind>:<deviceId>:<date>` — a per-device request counter,
  keyed by the UUID above.
- `ip-usage:<kind>:<ip>:<date>` — a per-IP request counter (this branch
  adds this), keyed by the caller's IP address as seen by Vercel
  (`x-forwarded-for`/`x-real-ip`), not persisted anywhere else.

**Retention:** every one of the Redis keys above is set to expire in **24
hours** (`incrWithDailyExpiry` calls `EXPIRE ... 86400` on first increment
each day) — nothing in Redis outlives one day. No goal content, chat text,
or message history is stored in Redis or anywhere else server-side; the
route is stateless per request beyond those daily counters.

### 2. On-device only (never leaves the device)

Everything else — the full goal/year data model, chat history as displayed
in the app, theme/board preferences, onboarding state — lives only in
`AsyncStorage` via the Zustand `persist` middleware (`store/useAppStore.ts`).
There is no sync, no account system, and no server-side copy of any of this
beyond the specific fields listed under (1) that get sent as part of a
coach/pair request.

## Deployment-specific caveat: the GitHub Pages web build

`deploy-web.yml` publishes a static export with **no server route at all**
— `/api/coach` 404s there by design, so `services/coachService.ts` always
falls back to the offline `StubCoachService` on that deployment. No data
leaves the device at all when using that build; the "coach" there is
entirely canned/local logic, permanently, not as a fallback for an outage.

This matters beyond the technical description: that same GitHub Pages URL
(`https://precisoqs-png.github.io/visiongo-rn/`) is listed as the **Support
URL** in the App Store Connect metadata (see `DEPLOYMENT.md`'s submission
checklist), and an App Review reviewer is likely to click it. They will see
a coach that never contacts Anthropic — a different (harmless, but
different) data-flow story than the shipped iOS app, which does. Worth
knowing when writing the App Privacy answers, since "does the app send data
to a third party" has a different literal answer depending on which build
is being looked at.

## Known gaps as of this branch (not fixed here — out of scope)

- No analytics or crash reporting SDK is integrated anywhere in this app.
  If one gets added later, this document and the privacy policy both need
  a fresh pass — that's explicitly not part of this branch.
- `COACH_SHARED_SECRET`/`EXPO_PUBLIC_COACH_SHARED_SECRET` (this branch) is
  not a privacy-relevant secret — it doesn't identify a user — but is
  extractable from the client bundle by design; noted here only for
  completeness, not because it needs privacy-policy language.
- `EXPO_PUBLIC_COACH_API_URL` is set on the Expo dashboard with its
  visibility marked "Secret." That label is misleading: every
  `EXPO_PUBLIC_*` variable is inlined into the app bundle in plain text at
  build time regardless of its dashboard visibility setting, so marking it
  "Secret" doesn't add any actual protection — anyone who unpacks the IPA
  can read the value. This is a known, accepted state, not an oversight:
  Expo doesn't allow a Secret-visibility variable to be edited, only
  deleted and recreated, and the current value can't be read back first —
  so relabeling it risks breaking a working coach configuration for a
  purely cosmetic fix. Documented here so this doesn't get "corrected"
  later by someone who hasn't seen this trade-off spelled out.
