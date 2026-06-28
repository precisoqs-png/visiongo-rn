# App Store Connect Metadata — VisionGo v1.0

Ready-to-paste fields for App Store Connect. Character counts noted where Apple imposes limits.

---

## App Name
```
VisionGo
```
8 characters (max 30)

---

## Subtitle
```
Your Annual Vision Board
```
24 characters (max 30)

---

## Description
> Max 4,000 characters. Paste into App Store Connect → App Store → Description.

```
VisionGo is the goal-tracking app built for people who think in years, not weeks.

Most goal apps are daily habit trackers. VisionGo is different — it's your annual vision board. Set the 3–8 goals that will define your year, break each one into measurable milestones, and watch your progress come to life on a beautiful radial board.

──────────────────────
SET MEANINGFUL ANNUAL GOALS
──────────────────────
Start with a 5-step onboarding that helps you name your year and define the goals that actually matter. Not a laundry list — the ones worth tracking for 12 months.

──────────────────────
TRACK REAL PROGRESS
──────────────────────
Every goal gets measurables — the specific things you'll track:
• Checkboxes for milestones ("Sign up for the race")
• Number targets with units ("Read 24 books")
• Progressive ladders that ramp up week by week ("Increase long run from 3 to 13 miles")

Progress rings show exactly how far along you are, goal by goal and year overall.

──────────────────────
AI COACH BUILT IN
──────────────────────
Open Coach Chat on any goal and talk through your plan with an AI coach. It asks the right questions, helps you identify concrete steps, and suggests measurables you can add to your goal with a single tap.

The coach knows your goal title and timeline — nothing else. Your other goals and personal data stay on your device.

──────────────────────
your VISION BOARD, YOUR WAY
──────────────────────
• Radial board — goals orbit a central progress ring like a vision wheel
• Grid view — clean list layout for focused review
• Month view — see which goals are active this month
• 5 handcrafted themes: Warm Paper, Black Plum, Charcoal, Deep Sea, Soft Blush
• Goal reminders: Daily, Weekly, or Monthly — per goal

──────────────────────
SMART TASK LIST
──────────────────────
Every measurable across every goal feeds into one unified task list, automatically grouped into: Overdue, This Week, This Month, Upcoming, and Anytime. No manual organization needed.

──────────────────────
COMPLETELY PRIVATE
──────────────────────
No account. No login. No analytics. No ads. Your goals are stored exclusively on your device using iOS's secure local storage. Delete the app and everything goes with it.

VisionGo is for the person with big plans and the self-awareness to pursue them deliberately. Set your vision. Track your progress. Finish the year proud.
```

Character count: ~2,050 (well within 4,000 limit — room to expand with screenshots captions or localization)

---

## Keywords
> Max 100 characters including commas. No spaces after commas (saves characters).

```
goals,vision board,annual planner,habit tracker,goal coach,ai coach,resolutions,year
```
84 characters

---

## Support URL
```
https://precisoqs-png.github.io/visiongo-rn/
```

---

## Privacy Policy URL
```
https://precisoqs-png.github.io/visiongo-rn/privacy-policy.html
```

---

## What's New — v1.0 (Initial Release)
```
Welcome to VisionGo! Set your annual goals, track measurable progress, and get AI coaching — all beautifully private and stored only on your device.
```

---

## App Store Categories
- **Primary:** Productivity
- **Secondary:** Health & Fitness *(optional)*

---

## Age Rating
- Expected result: **4+**
- No objectionable content, no user-generated public content, no gambling, no in-app purchases

---

## Pricing
- **Free**

---

## App Privacy — Data Types to Declare in App Store Connect

Navigate to: App Store Connect → Your App → App Privacy → Data Types

| Data Type | Collected? | Purpose | Linked to User? | Used for Tracking? |
|---|---|---|---|---|
| User Content (goal text in Coach Chat) | Yes | App Functionality | No | No |
| All other types | No | — | — | — |

**Notes for the questionnaire:**
- When asked about "User Content": select **App Functionality** as the purpose
- When asked if linked to identity: select **Data Not Linked to You** (no account system)
- When asked about tracking: **No**
- For all other data types (Contact Info, Health, Financial, Location, Identifiers, Diagnostics, etc.): select **No, we do not collect this data**

---

## Export Compliance
- **ITSAppUsesNonExemptEncryption: false** (already set in app.json)
- Answer **No** to the export compliance question during submission
- Reason: app uses only standard HTTPS/TLS, no custom cryptography

---

## Screenshot Requirements

Minimum required device sizes:

| Device | Resolution | Notes |
|---|---|---|
| iPhone 6.9" (16 Pro Max) | 1320×2868 or 1290×2796 | **Required** |
| iPhone 5.5" (8 Plus) | 1242×2208 | **Required** |
| iPad 13" | 2064×2752 | Only if supportsTablet: true |

Recommended screens to capture (3+ per size):
1. **Board (radial view)** — shows the core vision board UI
2. **Goal detail** — measurables + progress bar
3. **Settings / themes** — demonstrates the 5 themes
4. *(Optional)* Onboarding step 1 or Coach Chat
