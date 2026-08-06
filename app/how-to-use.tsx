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
    key: 'measurables-milestones',
    title: 'Measurables and Milestones',
    icon: 'checkbox-outline',
    body:
      'Measurables are the trackable numbers behind a goal, like counts, checklists, or ' +
      'step by step build ups. Milestones are the bigger checkpoints and commitments you ' +
      'set for yourself. Add either manually or ask the AI Coach to set them up for you. ' +
      'Add a why this matters note to remind yourself why the goal counts.',
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
