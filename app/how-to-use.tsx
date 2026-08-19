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
      'scratch.\n\n' +
      'Onboarding asks once for an achieve-by date to apply to every goal you pick — a ' +
      'fast shared default, not a form per goal — but each goal actually gets its own ' +
      'date, and any goal can be given a different one right there before you finish, or ' +
      'changed anytime after from that goal\'s own canvas (see Inside a Goal).',
  },
  {
    key: 'inside-a-goal',
    title: 'Inside a Goal',
    icon: 'ellipse-outline',
    body:
      'Tapping a bubble opens its own canvas: a big central bubble showing overall ' +
      "progress, with the goal's Milestones orbiting around it as their own smaller " +
      "bubbles (Measurables don't get canvas bubbles of their own — see the Measurables " +
      'topic). Tap a Milestone bubble to open it: a drill-in sheet showing that ' +
      "Milestone's own row plus every Measurable under it, each tickable, editable, and " +
      'with its own reminder bell, including individual commitment/build-up steps. Once ' +
      'the goal has at least one Milestone, a "+ Milestone" button in the corner adds ' +
      'another without leaving the canvas; an empty goal shows a card offering to let ' +
      'the Coach break it down instead. The bottom tab bar (Board, Pair, Tasks, ' +
      'Settings) stays visible the whole time — tap another tab directly, or tap the ' +
      'year row to zoom back out to the board. Use the Measurables and Milestones ' +
      'toggle near the top to open the full list view of either for more room to add ' +
      "or edit. Tap the goal's own \"Achieve by\" row to set or change its deadline — " +
      'the first one usually comes from onboarding (see Vision Board), which sets a ' +
      'date per goal, not one shared date for everything you picked.',
  },
  {
    key: 'milestones',
    title: 'Milestones',
    icon: 'flag-outline',
    body:
      'Milestones are the big binary wins on a goal — "Save $10,000," "Run a marathon" — ' +
      'a title and an optional deadline, nothing to tick up, just done or not done. They ' +
      'live as the bubbles on the goal\'s own canvas, and every Measurable you track (see ' +
      'the Measurables topic) belongs to one. A goal only shows 100% once every Milestone ' +
      'and every one of its Measurables is complete.\n\n' +
      'Tap a Milestone\'s bubble on the canvas to open it: a drill-in sheet listing the ' +
      'Milestone\'s own row and every Measurable under it, all tickable and editable right ' +
      'there. Add a new milestone from the canvas\'s own "+ Milestone" button, from the ' +
      'Milestones tab, or ask the Coach to break the goal down for you. Give it a title ' +
      'and, optionally, a Deadline picked from the calendar. If the goal\'s own "Achieve ' +
      'by" date later changes, a milestone whose deadline was inherited from it shows an ' +
      '"update or keep as-is" banner. Mark it done with a single tap of its circle icon, ' +
      'or by holding its bubble on the canvas (once it has no Measurables under it — a ' +
      'milestone with children is a pure container, and its own fraction comes entirely ' +
      'from theirs). Delete a milestone with the trash/× icon — this also removes every ' +
      'Measurable and Commitment attached to it and cancels their reminders.',
  },
  {
    key: 'measurables',
    title: 'Measurables and Commitments',
    icon: 'checkbox-outline',
    body:
      'Measurables are the quantified thing under a Milestone — every Measurable belongs ' +
      'to one, there\'s no such thing as a standalone Measurable. A good Measurable is ' +
      'concrete and countable: a specific unit and target you tick up as you go. Unlike a ' +
      'Milestone, a Measurable has no bubble of its own on the goal\'s canvas — open its ' +
      'Milestone\'s bubble (a tap) to reach it, in a drill-in sheet listing every ' +
      'Measurable underneath, or use the Measurables tab for the full list at once. Either ' +
      'way its fill (alongside its Milestone\'s own done/not-done state) is what drives ' +
      'the goal bubble\'s size and percentage. Add one from the Measurables tab on a goal ' +
      '— you\'ll need at least one Milestone to attach it to first — or ask the Coach, ' +
      'which creates a Milestone for it automatically if none exists yet.\n\n' +
      'Three types:\n\n' +
      '• Checkbox — a single one-time tick, like "Sign up for a race." Done is 100%, ' +
      'not done is 0%.\n\n' +
      '• Number — a running count toward a target, like "145/150 days active." Set a ' +
      'Target, an optional Unit (e.g. "km", "$"), and a Step — how much one tap of the ' +
      '+/- buttons moves the number (defaults to 1). Use the +/- steppers in the ' +
      'Measurables list or the drill-in sheet. A Number measurable with no reminder also ' +
      'shows up as a repeatable row on the Tasks tab — tap it there whenever you make ' +
      'progress; it stays put, updating its own count, until it reaches target.\n\n' +
      '• Build-up (a "ladder" under the hood) — a progressive weekly target that climbs ' +
      'from a Start value to an End value over a number of weeks, e.g. building a run from ' +
      '2 km to 10 km over 8 weeks. Set Start, "+ per week," Weeks, and a Unit; VisionGo ' +
      'paces one target date per week back from the goal\'s "Achieve by" date (or from ' +
      'today if the goal has no date). Tick off each week as you hit it, from the ' +
      'Measurables list or the drill-in sheet. If you later change the goal\'s target ' +
      'date, a banner offers to re-pace the remaining weeks against the new date, or you ' +
      'can dismiss it and keep the original schedule.\n\n' +
      'Commitments are recurring actions you attach to a Measurable — tap "Commitment" on ' +
      'a Measurable\'s card to add one, in one of two shapes:\n\n' +
      '• Same each time — a flat recurring target on a Weekly, Monthly, or Custom (every N ' +
      'days) cadence, checked off each period with a tap. Consecutive completed periods ' +
      'build a streak, shown once it reaches 2.\n\n' +
      '• Build up gradually — a Start→End value ramping week by week, identical math to a ' +
      'Build-up Measurable, with each week individually checkable once you expand the row.\n\n' +
      'Every Measurable and every Commitment can carry its own optional reminder — tap ' +
      'its bell icon to pick a cadence and a time; this needs Push Notifications on in ' +
      'Settings and is separate from the goal\'s own check-in reminder. Delete a Measurable ' +
      'or Commitment with the trash/× icon — deleting cancels any reminders tied to it. Add ' +
      'a "why this matters" note on the goal itself (below its title) to remind yourself ' +
      'why the goal counts.',
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
      'Overdue, This Week, This Month, Upcoming, and Anytime.\n\n' +
      'A Number Measurable with no reminder set shows up here too, as a persistent row ' +
      'under Anytime — a tap increments its count right there (e.g. "12/150") and it ' +
      'stays in the list, updating in place, until it reaches its target. One with a ' +
      'reminder instead gets an ordinary dated row each period, like any other task.',
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
      'individual Measurables and Commitments using their own bell icon. Reminders only ' +
      'work on iPhone and Android, not on web.',
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
