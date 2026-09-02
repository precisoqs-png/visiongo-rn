import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/useThemeStore';
import { FONTS } from '../theme/themes';

// Source of truth is this screen, not docs/privacy-policy.html — that file
// lives in the docs/ folder deployed by its own deploy-docs.yml workflow,
// which shares a GitHub Pages target with deploy-web.yml (the Expo web
// export, triggered on every push to main). The two raced for the same
// Pages deployment and deploy-web almost always won, since it fires far
// more often than a docs/-only change — that's why the store-listed
// privacy policy URL 404'd. Serving it as a real in-app route instead ties
// its availability to the SAME single deploy (deploy-web.yml already
// copies dist/index.html to dist/404.html for SPA deep-link support, so
// /privacy-policy resolves exactly like /how-to-use does) rather than a
// second workflow that has to stay in lockstep with the first. Keep this
// copy and docs/privacy-policy.html's copy in sync if either changes —
// the docs/ copy is retained only as the plain HTML APPLE_PRIVACY_URL/
// support-page fallback, not as the canonical link anymore. See
// STORE_METADATA.md and DEPLOYMENT.md for the updated link.
interface Section {
  key: string;
  title: string;
  body: string;
}

const EFFECTIVE_DATE = 'June 28, 2025';

const SUMMARY =
  "The short version: VisionGo stores your goals and tasks only on your device. We have no servers, " +
  "no accounts, and no analytics. If you use the optional AI coaching feature, only the goal title and " +
  "conversation text you type is sent to Anthropic's API to generate a response — nothing else. You can " +
  'delete all data at any time by deleting the app.';

const SECTIONS: Section[] = [
  {
    key: 'who',
    title: '1. Who We Are',
    body:
      'VisionGo is a personal goal-tracking app developed and operated by VisionGo ("we," "us," or ' +
      '"our"). If you have questions about this policy, email us at support@visiongo.app.',
  },
  {
    key: 'data',
    title: '2. Data We Collect — and Where It Stays',
    body:
      'VisionGo is designed around local-first storage. Almost everything you enter never leaves your ' +
      'device.\n\n' +
      'Stored locally on your device only (via AsyncStorage): goals, titles, target dates, and reminder ' +
      'preferences; measurables and their progress values; tasks and task completion status; your annual ' +
      'motto and year data; app preferences (theme selection, onboarding state); and coach chat ' +
      'conversation history.\n\n' +
      "We do not operate any servers, databases, or cloud sync for this data. It exists exclusively in " +
      "your device's local storage. Deleting the app permanently deletes all of it.",
  },
  {
    key: 'coach',
    title: '3. Optional AI Coaching Feature',
    body:
      "VisionGo includes an optional AI coach powered by Anthropic's Claude API. This feature is only " +
      'active if you open the Coach Chat inside a goal screen and send a message.\n\n' +
      'What is sent to Anthropic when you use Coach Chat: the title of the goal you are coaching on; the ' +
      "target date and approximate weeks remaining (if set); today's date; and the conversation messages " +
      'you type in the chat.\n\n' +
      'What is NOT sent to Anthropic: your other goals; progress values, measurables, or task data; any ' +
      'personal identifier (name, email, device ID); and your theme or other app preferences.\n\n' +
      "Anthropic processes messages to generate coaching responses. Anthropic's handling of API data is " +
      "governed by their own Privacy Policy (anthropic.com/privacy) and Usage Policy " +
      "(anthropic.com/legal/usage-policy). API data submitted through our integration is not used to " +
      'train Anthropic\'s models by default.\n\n' +
      'If you prefer not to use the AI coaching feature, simply do not open Coach Chat. All other ' +
      'features of the app function without any network requests.',
  },
  {
    key: 'notifications',
    title: '4. Notifications',
    body:
      "If you enable goal reminders in Settings, VisionGo uses your device's built-in local notification " +
      'system to schedule reminders. Notification data (goal title and reminder schedule) is processed ' +
      'entirely on your device and is never transmitted to us or any third party.',
  },
  {
    key: 'no-tracking',
    title: '5. No Account, No Tracking',
    body:
      'No account required. VisionGo has no sign-up, login, or user account system.\n\n' +
      'No analytics. We do not use any analytics, crash-reporting, or usage-tracking SDK. We collect no ' +
      'metrics about how you use the app.\n\n' +
      'No advertising. We display no ads and share no data with advertisers.\n\n' +
      'No third-party SDKs beyond the Anthropic API (optional, described above).',
  },
  {
    key: 'children',
    title: "6. Children's Privacy",
    body:
      'VisionGo is not directed at children under 13. We do not knowingly collect any personal ' +
      'information from children. If you believe a child under 13 has provided information through the ' +
      'AI coaching feature, please contact us at support@visiongo.app and we will provide guidance on ' +
      'removing it.',
  },
  {
    key: 'deletion',
    title: '7. Data Deletion',
    body:
      'Because all data is stored locally on your device, you control deletion entirely.\n\n' +
      'Delete all data: delete the VisionGo app from your device. The OS removes all associated local ' +
      'storage automatically.\n\n' +
      'Delete individual goals: use the delete option within the app.\n\n' +
      "AI coach conversation: coach chat history is stored locally. Clearing app data or deleting the " +
      "app removes it. Messages already sent to Anthropic's API are subject to Anthropic's own data " +
      'retention policy.\n\n' +
      'To request assistance with data concerns, contact us at support@visiongo.app.',
  },
  {
    key: 'security',
    title: '8. Security',
    body:
      "Your goal data lives in your device's sandboxed local storage, protected by the OS's standard " +
      "security model (device encryption, biometric lock screen). Network requests to the Anthropic API " +
      'are made exclusively over HTTPS (TLS). We do not store or log any API request or response on our ' +
      'end — because we have no servers.',
  },
  {
    key: 'changes',
    title: '9. Changes to This Policy',
    body:
      'If we make material changes to this privacy policy, we will update the "Last updated" date at ' +
      'the top and, if the changes are significant, provide notice within the app. Continued use of ' +
      'VisionGo after changes constitutes acceptance of the updated policy.',
  },
  {
    key: 'contact',
    title: '10. Contact',
    body: 'For privacy questions, data deletion requests, or any concerns: support@visiongo.app',
  },
];

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const palette = useThemeStore((s) => s.palette);
  const p = palette;

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back to Settings"
        >
          <Ionicons name="chevron-back" size={16} color={p.text} />
          <Text style={[styles.backText, { color: p.text }]}>Settings</Text>
        </TouchableOpacity>
        <Text style={[styles.eyebrow, { color: p.muted }]}>LEGAL</Text>
        <Text style={[styles.title, { color: p.text, fontFamily: FONTS.display }]}>Privacy Policy</Text>
        <Text style={[styles.effectiveDate, { color: p.muted }]}>
          Effective {EFFECTIVE_DATE} · Last updated {EFFECTIVE_DATE}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40 }}>
        <View style={[styles.summaryCard, { backgroundColor: p.surface, borderColor: `${p.accent}33` }]}>
          <Text style={[styles.summaryText, { color: p.text }]}>{SUMMARY}</Text>
        </View>

        {SECTIONS.map((s) => (
          <View key={s.key} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: p.text }]}>{s.title}</Text>
            <Text style={[styles.sectionBody, { color: p.textSecondary }]}>{s.body}</Text>
          </View>
        ))}

        <TouchableOpacity
          onPress={() => Linking.openURL('mailto:support@visiongo.app')}
          style={styles.emailRow}
          accessibilityRole="button"
          accessibilityLabel="Email support@visiongo.app"
        >
          <Ionicons name="mail-outline" size={15} color={p.accent} />
          <Text style={[styles.emailText, { color: p.accent }]}>support@visiongo.app</Text>
        </TouchableOpacity>
      </ScrollView>
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
  effectiveDate: { fontSize: 12, marginTop: 6 },
  summaryCard: { borderRadius: 14, borderWidth: 1, padding: 18, marginTop: 6, marginBottom: 10 },
  summaryText: { fontSize: 14, lineHeight: 21, fontWeight: '500' },
  section: { marginTop: 22 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  sectionBody: { fontSize: 14, lineHeight: 21 },
  emailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 28, alignSelf: 'center',
  },
  emailText: { fontSize: 14, fontWeight: '600' },
});
