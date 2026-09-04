import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/useThemeStore';
import { FONTS } from '../theme/themes';

// This screen is the ONLY copy of the privacy policy — there used to also
// be docs/privacy-policy.html, deployed by its own deploy-docs.yml
// workflow, which shared a GitHub Pages target with deploy-web.yml (the
// Expo web export, triggered on every push to main). The two raced for the
// same Pages deployment and deploy-web almost always won, since it fires
// far more often than a docs/-only change — that's why the store-listed
// privacy policy URL 404'd. Rather than keep two copies of a legal
// document in sync by hand (which drifts, silently, until the wrong one is
// what App Review or a user actually reads), docs/privacy-policy.html was
// deleted outright and deploy-docs.yml removed. Serving it as a real
// in-app route ties its availability to the SAME single deploy
// (deploy-web.yml already copies dist/index.html to dist/404.html for SPA
// deep-link support, so /privacy-policy resolves exactly like /how-to-use
// does). See STORE_METADATA.md and DEPLOYMENT.md for the published link.
interface Section {
  key: string;
  title: string;
  body: string;
}

const EFFECTIVE_DATE = 'June 28, 2025';
const LAST_UPDATED = 'September 2, 2026';

const SUMMARY =
  'The short version: VisionGo stores your goals and tasks only on your device. We have no user ' +
  'accounts and no analytics. The optional AI Coach and Pair features route through a small server ' +
  "we operate, which forwards your message to Anthropic's API and briefly tracks an anonymous " +
  "per-device usage count to enforce fair-use limits — it does not store your goals or chat content. " +
  'You can delete all your on-device data at any time by deleting the app.';

const SECTIONS: Section[] = [
  {
    key: 'who',
    title: '1. Who We Are',
    body:
      'VisionGo is a personal goal-tracking app developed and operated by VisionGo ("we," "us," or ' +
      '"our"). If you have questions about this policy, email us at visiongoapp@gmail.com.',
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
      'We operate one small server-side proxy, used only when you use the optional AI Coach or Pair ' +
      'features — see Section 3 for exactly what it receives and retains. Beyond that proxy, we do not ' +
      "operate any database or cloud sync for your goal data: it exists exclusively in your device's " +
      'local storage, and deleting the app permanently deletes all of it.',
  },
  {
    key: 'coach',
    title: '3. Optional AI Coach and Pair Features',
    body:
      'VisionGo includes two optional features that use an AI model to generate a response: Coach Chat, ' +
      'inside a goal screen, and Pair, which writes a short note on how two of your goals reinforce each ' +
      'other. Both are only active if you open that screen and send a message or request.\n\n' +
      'Both features route through a small server we operate (a proxy, deployed on Vercel) rather than ' +
      "calling Anthropic's Claude API directly from the app. This exists so the API key that pays for " +
      'these requests is never embedded in the app itself, and so we can enforce the usage limits ' +
      'described below.\n\n' +
      'What is sent through our proxy to Anthropic when you use Coach Chat: the title of the goal you ' +
      "are coaching on; the target date and approximate weeks remaining (if set); today's date; and the " +
      'conversation messages you type in the chat. What is sent when you use Pair: the titles of the two ' +
      'goals you selected — nothing else about them.\n\n' +
      'What is NOT sent, to Anthropic or to us: your other goals; progress values, measurables, or task ' +
      'data beyond what is listed above; any personal identifier such as your name, email, or account ' +
      '(VisionGo has none); and your theme or other app preferences.\n\n' +
      'What our proxy itself receives and keeps: every request to it also carries a device identifier — ' +
      'a random ID generated on your device the first time you use Coach Chat or Pair, stored locally, ' +
      'and never linked to your name, an account, or any other identifying information. Our server uses ' +
      'it only to enforce a daily limit (currently 20 Coach messages and 5 Pair requests per device, per ' +
      'day) so no single device can use a disproportionate share of the shared API budget. This is ' +
      'tracked as a simple daily count, keyed by that device ID, in a Redis database (Upstash); each ' +
      "count expires automatically 24 hours after it's created. Your goal content, chat messages, and " +
      'conversation history are never stored on our server — beyond that one daily count, the proxy ' +
      'retains nothing between requests.\n\n' +
      'Server logs: when a request to Anthropic or to our rate-limit database times out or fails, our ' +
      'proxy writes a basic error log line, which may include the device identifier and a timestamp but ' +
      'never your goal content or chat messages. Like most hosting providers, our host (Vercel) may also ' +
      'retain standard connection-level logs (such as IP address) in the ordinary course of running its ' +
      'platform, governed by its own privacy policy (vercel.com/legal/privacy-policy).\n\n' +
      "Anthropic processes the messages we forward to generate coaching and pairing responses. Anthropic's " +
      "handling of that data is governed by their own Privacy Policy (anthropic.com/privacy) and Usage " +
      'Policy (anthropic.com/legal/usage-policy). API data submitted through our integration is not used ' +
      "to train Anthropic's models by default.\n\n" +
      'If you prefer not to use either feature, simply do not open Coach Chat or Pair — no device ' +
      'identifier is generated and no request is made until you do. Every other feature of the app ' +
      'functions without any network requests.',
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
      'AI coaching feature, please contact us at visiongoapp@gmail.com and we will provide guidance on ' +
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
      "Device identifier and usage count: the per-device usage count described in Section 3 isn't " +
      "something you need to separately request deletion of — it expires and is deleted automatically " +
      '24 hours after each daily count is created, with no action needed from you.\n\n' +
      'To request assistance with data concerns, contact us at visiongoapp@gmail.com.',
  },
  {
    key: 'security',
    title: '8. Security',
    body:
      "Your goal data lives in your device's sandboxed local storage, protected by the OS's standard " +
      'security model (device encryption, biometric lock screen). When you use Coach Chat or Pair, ' +
      'requests to our proxy and to the Anthropic API are made exclusively over HTTPS (TLS). Our proxy ' +
      'does not store or log your goal content or chat messages — the only thing it retains is the ' +
      'short-lived, anonymous per-device usage count described in Section 3.',
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
    body: 'For privacy questions, data deletion requests, or any concerns: visiongoapp@gmail.com',
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
          Effective {EFFECTIVE_DATE} · Last updated {LAST_UPDATED}
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
          onPress={() => Linking.openURL('mailto:visiongoapp@gmail.com')}
          style={styles.emailRow}
          accessibilityRole="button"
          accessibilityLabel="Email visiongoapp@gmail.com"
        >
          <Ionicons name="mail-outline" size={15} color={p.accent} />
          <Text style={[styles.emailText, { color: p.accent }]}>visiongoapp@gmail.com</Text>
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
