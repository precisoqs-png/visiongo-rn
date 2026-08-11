import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/useThemeStore';
import { FONTS } from '../theme/themes';

interface Topic {
  key: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  body: string;
}

// Content is fixed copy, not derived from live app state — it documents the
// steady-state feature set, so it's kept as plain data here rather than
// scattered across the screens it describes.
const TOPICS: Topic[] = [
  {
    key: 'vision-board',
    title: 'Vision Board',
    icon: 'grid-outline',
    body:
      'Your home screen. Each bubble is a goal, and bubbles grow as you make progress. ' +
      'Tap the year row to switch Whole Year and By Month view. Tap a bubble to open that ' +
      'goal. Press and hold a bubble to drag and reposition it. Long press the header to ' +
      'cycle color themes. Use the plus button to add a goal from a template or from ' +
      'scratch.',
  },
  {
    key: 'inside-a-goal',
    title: 'Inside a Goal',
    icon: 'ellipse-outline',
    body:
      "Tapping a bubble opens its own canvas with a big central bubble showing overall " +
      "progress and measurables orbiting around it. Use the Measurables and Milestones " +
      "toggle at the top to switch views. Tap the year row to return to the board.",
  },
  {
    key: 'measurables',
    title: 'Measurables',
    icon: 'checkbox-outline',
    body:
      'Measurables are the quick, directly-trackable items on a goal itself — no sub-goal ' +
      'of their own, just a concrete number or check you tick up as you go. They show as ' +
      'bubbles on the goal\'s own canvas, and their fill is what drives that bubble\'s size ' +
      'and percentage (milestones are checkpoints, not fill — see the Milestones topic). ' +
      'Add one from the Measurables tab on a goal, or by asking the Coach.\n\n' +
      'Three types:\n\n' +
      '• Checkbox — a single one-time tick, like "Sign up for a race." Done is 100%, ' +
      'not done is 0%.\n\n' +
      '• Number — a running count toward a target, like "145/150 days active." Set a ' +
      'Target, an optional Unit (e.g. "km", "$"), and a Step — how much one tap of the ' +
      '+/- buttons moves the number (defaults to 1). Tap the bubble on the canvas and ' +
      'hold to advance it by one step, or use the +/- steppers in the Measurables list.\n\n' +
      '• Build-up (a "ladder" under the hood) — a progressive weekly target that climbs ' +
      'from a Start value to an End value over a number of weeks, e.g. building a run from ' +
      '2 km to 10 km over 8 weeks. Set Start, "+ per week," Weeks, and a Unit; VisionGo ' +
      'paces one target date per week back from the goal\'s "Achieve by" date (or from ' +
      'today if the goal has no date). Tick off each week as you hit it — holding the ' +
      'bubble on the canvas advances to the next not-yet-done week. If you later change ' +
      'the goal\'s target date, a banner offers to re-pace the remaining weeks against the ' +
      'new date, or you can dismiss it and keep the original schedule.\n\n' +
      'Every measurable can also carry its own optional reminder — tap its bell icon in ' +
      'the Measurables list to pick a cadence (daily/weekly/monthly-style schedule) and a ' +
      'time; this needs Push Notifications on in Settings and is separate from the goal\'s ' +
      'own check-in reminder. Delete a measurable with the × next to it; edit any field by ' +
      'tapping its bubble on the canvas or its card in the Measurables list.',
  },
  {
    key: 'milestones',
    title: 'Milestones and Commitments',
    icon: 'flag-outline',
    body:
      'Milestones are sub-goals — "Save $10,000," "Run a marathon" — that can carry their ' +
      'own deadline and recurring Commitments you get reminded about. They\'re discrete ' +
      'checkpoints, each either "reached" or "not yet" rather than a continuous number, and ' +
      'reaching one still shows as a small tick mark on the goal\'s bubble — but a milestone ' +
      'also counts toward the goal\'s fill percentage, right alongside its measurables. A ' +
      'goal only shows 100% once every measurable and every milestone is complete.\n\n' +
      'Add a milestone from the Milestones tab on a goal. Give it a title, and optionally:\n\n' +
      '• Target, Unit, and Step — fill these in to make it a Numeric milestone tracked by ' +
      'a running current/target number, with its own +/- steppers. Leave Target blank and ' +
      'it becomes an Effort milestone instead, marked done with a single tap of its circle ' +
      'icon.\n\n' +
      '• Deadline — pick a date from the calendar. A numeric milestone with both a Target ' +
      'and a Deadline gets offered an automatic weekly/monthly split ("12 payments of ' +
      '$1,000") the moment you add it. If the goal\'s own "Achieve by" date later changes, ' +
      'a milestone whose deadline was inherited from it shows an "update or keep as-is" ' +
      'banner.\n\n' +
      'Commitments are the recurring actions attached to a milestone — tap "Commitment" on ' +
      'a milestone card to add one, in one of two shapes:\n\n' +
      '• Same each time — a flat recurring target on a Weekly, Monthly, or Custom (every N ' +
      'days) cadence, checked off each period with a tap. Consecutive completed periods ' +
      'build a streak, shown once it reaches 2.\n\n' +
      '• Build up gradually — a Start→End value ramping week by week (identical math to a ' +
      'Build-up measurable, just attached to a milestone instead), with each week ' +
      'individually checkable once you expand the row.\n\n' +
      'Every commitment has its own bell for an independent reminder (needs Push ' +
      'Notifications on in Settings, same as measurables). Delete a commitment or a whole ' +
      'milestone with the trash/× icon — deleting cancels any reminders tied to it. Add a ' +
      '"why this matters" note on the goal itself (below its title) to remind yourself why ' +
      'the goal counts, or ask the Coach to break a goal down into measurables and ' +
      'milestones for you.',
  },
  {
    key: 'pair',
    title: 'Pair',
    icon: 'link-outline',
    body:
      'Pick two goals and tap See how they align for a short AI written note on how they ' +
      'support each other. Limited to five uses per day.',
  },
  {
    key: 'tasks',
    title: 'Tasks',
    icon: 'list-outline',
    body:
      'One combined checklist of everything due across all your goals, grouped by ' +
      'Overdue, This Week, This Month, Upcoming, and Anytime.',
  },
  {
    key: 'ai-coach',
    title: 'AI Coach',
    icon: 'sparkles-outline',
    body:
      'Available inside Measurables, Milestones, and the chat button on a goal canvas. It ' +
      'can suggest and add or edit items for you, but every change needs your approval ' +
      'first. Limited to twenty messages per day.',
  },
  {
    key: 'notifications',
    title: 'Notifications',
    icon: 'notifications-outline',
    body:
      'Turn reminders on in Settings. Choose daily, weekly, or monthly check ins per ' +
      'goal, get automatic reminders for weekly build up targets, and set reminders for ' +
      'individual milestones using the bell icon. Reminders only work on iPhone and ' +
      'Android, not on web.',
  },
  {
    key: 'settings-themes',
    title: 'Settings and Themes',
    icon: 'color-palette-outline',
    body:
      'Change the color theme anytime from Settings, or by long pressing the Board ' +
      'header. Start Fresh restarts onboarding without deleting existing goals.',
  },
];

export default function HowToUseScreen() {
  const router = useRouter();
  const palette = useThemeStore((s) => s.palette);
  const p = palette;

  const [openKey, setOpenKey] = useState<string | null>(null);
  const openTopic = TOPICS.find((t) => t.key === openKey) ?? null;

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (openTopic ? setOpenKey(null) : router.back())}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={16} color={p.text} />
          <Text style={[styles.backText, { color: p.text }]}>
            {openTopic ? 'How to Use' : 'Settings'}
          </Text>
        </TouchableOpacity>
        <Text style={[styles.eyebrow, { color: p.muted }]}>
          {openTopic ? 'TOPIC' : 'HELP'}
        </Text>
        <Text style={[styles.title, { color: p.text, fontFamily: FONTS.display }]}>
          {openTopic ? openTopic.title : 'How to Use'}
        </Text>
      </View>

      {openTopic ? (
        <ScrollView contentContainerStyle={styles.detailScroll}>
          <View style={[styles.detailCard, { backgroundColor: p.surface }]}>
            <View style={[styles.detailIconWrap, { backgroundColor: `${p.accent}1a` }]}>
              <Ionicons name={openTopic.icon} size={22} color={p.accent} />
            </View>
            <Text style={[styles.detailBody, { color: p.text }]}>{openTopic.body}</Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={[styles.intro, { color: p.muted }]}>
            A quick tour of every part of VisionGo. Tap a topic for details.
          </Text>
          {TOPICS.map((topic) => (
            <TouchableOpacity
              key={topic.key}
              style={[styles.topicRow, { backgroundColor: p.surface }]}
              onPress={() => setOpenKey(topic.key)}
              activeOpacity={0.75}
            >
              <View style={[styles.topicIconWrap, { backgroundColor: `${p.accent}1a` }]}>
                <Ionicons name={topic.icon} size={18} color={p.accent} />
              </View>
              <Text style={[styles.topicText, { color: p.text }]}>{topic.title}</Text>
              <Ionicons name="chevron-forward" size={14} color={p.muted} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 10 },
  backText: { fontSize: 14, fontWeight: '500' },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 2 },
  title: { fontSize: 28, fontWeight: '700', marginTop: 2 },
  intro: { fontSize: 13, lineHeight: 19, paddingHorizontal: 20, paddingBottom: 14 },
  topicRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 14, marginHorizontal: 18, marginBottom: 8,
  },
  topicIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  topicText: { fontSize: 15, fontWeight: '600', flex: 1 },
  detailScroll: { paddingHorizontal: 18, paddingBottom: 40 },
  detailCard: { borderRadius: 16, padding: 18 },
  detailIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  detailBody: { fontSize: 15, lineHeight: 23 },
});
