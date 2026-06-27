import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions, Animated, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/useThemeStore';
import { useAppStore } from '../store/useAppStore';
import { GOAL_NOTE_COLORS, FONTS } from '../theme/themes';

const { width } = Dimensions.get('window');

export default function OnboardingScreen() {
  const router = useRouter();
  const palette = useThemeStore((s) => s.palette);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const p = palette;

  const [step, setStep] = useState(0);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [motto, setMotto] = useState('Dream it. Plan it. Live it.');
  const [goalTitles, setGoalTitles] = useState(['', '', '']);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const advance = () => {
    if (step < 4) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -20, duration: 120, useNativeDriver: true }),
      ]).start(() => {
        setStep((s) => s + 1);
        slideAnim.setValue(20);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start();
      });
    } else {
      completeOnboarding(selectedYear, motto, goalTitles);
      router.replace('/(tabs)/board');
    }
  };

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      <View style={styles.dots}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: i === step ? p.accent : p.line },
              i === step && { width: 20 },
            ]}
          />
        ))}
      </View>

      <Animated.View
        style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        {step === 0 && <WelcomeStep p={p} />}
        {step === 1 && (
          <YearStep p={p} selectedYear={selectedYear} onYearChange={setSelectedYear} />
        )}
        {step === 2 && (
          <MottoStep p={p} motto={motto} onMottoChange={setMotto} year={selectedYear} />
        )}
        {step === 3 && (
          <GoalsStep p={p} goalTitles={goalTitles} onGoalChange={setGoalTitles} />
        )}
        {step === 4 && (
          <ReadyStep p={p} year={selectedYear} motto={motto} goalTitles={goalTitles} />
        )}
      </Animated.View>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: p.ink }]} onPress={advance}>
          <Text style={[styles.btnText, { color: p.isDark ? p.bg : '#fff' }]}>
            {step === 4 ? "Let's go!" : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

function WelcomeStep({ p }: any) {
  return (
    <View style={styles.stepCenter}>
      <View style={[styles.iconCircle, { backgroundColor: `${p.accent}26` }]}>
        <Text style={[styles.iconText, { color: p.accent }]}>◈</Text>
      </View>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={[styles.subHeading, { color: p.muted }]}>Welcome to</Text>
        <Text style={[styles.bigTitle, { color: p.text, fontFamily: FONTS.display }]}>VisionGo</Text>
      </View>
      <Text style={[styles.body, { color: p.muted }]}>
        Your personal vision board for turning big dreams into measurable goals — one step at a time.
      </Text>
    </View>
  );
}

function YearStep({ p, selectedYear, onYearChange }: any) {
  return (
    <View style={styles.stepCenter}>
      <Text style={[styles.eyebrow, { color: p.muted }]}>Step 1 of 4</Text>
      <Text style={[styles.heading, { color: p.text }]}>What year are{'\n'}you planning?</Text>
      <Text style={[styles.body, { color: p.muted }]}>This becomes the center of your vision board.</Text>
      <View style={[styles.yearPicker, { backgroundColor: p.surface }]}>
        <TouchableOpacity onPress={() => onYearChange(selectedYear - 1)} style={[styles.yearBtn, { backgroundColor: p.line }]}>
          <Ionicons name="chevron-back" size={18} color={p.muted} />
        </TouchableOpacity>
        <Text style={[styles.yearNum, { color: p.text }]}>{selectedYear}</Text>
        <TouchableOpacity onPress={() => onYearChange(selectedYear + 1)} style={[styles.yearBtn, { backgroundColor: p.line }]}>
          <Ionicons name="chevron-forward" size={18} color={p.muted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MottoStep({ p, motto, onMottoChange, year }: any) {
  return (
    <View style={styles.stepCenter}>
      <Text style={[styles.eyebrow, { color: p.muted }]}>Step 2 of 4</Text>
      <Text style={[styles.heading, { color: p.text }]}>Your {year}{'\n'}motto</Text>
      <Text style={[styles.body, { color: p.muted }]}>A short phrase that captures your vision for the year.</Text>
      <TextInput
        style={[styles.mottoInput, { backgroundColor: p.surface, color: p.text, borderColor: p.line }]}
        value={motto}
        onChangeText={(t) => { if (t.length <= 80) onMottoChange(t); }}
        multiline
        maxLength={80}
        placeholder="Enter your motto…"
        placeholderTextColor={p.muted}
      />
      <Text style={[{ color: p.muted, fontSize: 11, alignSelf: 'flex-end' }]}>{motto.length} / 80</Text>
    </View>
  );
}

function GoalsStep({ p, goalTitles, onGoalChange }: any) {
  return (
    <View style={styles.stepCenter}>
      <Text style={[styles.eyebrow, { color: p.muted }]}>Step 3 of 4</Text>
      <Text style={[styles.heading, { color: p.text }]}>Seed your board</Text>
      <Text style={[styles.body, { color: p.muted }]}>Add 1–3 goals to start. You can always add more later.</Text>
      <View style={{ gap: 10, width: '100%' }}>
        {goalTitles.map((title: string, i: number) => (
          <View key={i} style={styles.goalInputRow}>
            <View style={[styles.goalDot, { backgroundColor: GOAL_NOTE_COLORS[i] }]} />
            <TextInput
              style={[styles.goalInput, { backgroundColor: p.surface, color: p.text }]}
              placeholder={`Goal ${i + 1} (optional)`}
              placeholderTextColor={p.muted}
              value={title}
              onChangeText={(t) => {
                const arr = [...goalTitles];
                arr[i] = t;
                onGoalChange(arr);
              }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

function ReadyStep({ p, year, motto, goalTitles }: any) {
  const filled = goalTitles.filter((t: string) => t.trim().length > 0);
  return (
    <View style={styles.stepCenter}>
      <View style={[styles.iconCircle, { backgroundColor: `${p.accent}26` }]}>
        <Ionicons name="checkmark" size={36} color={p.accent} />
      </View>
      <Text style={[styles.bigTitle, { color: p.text, fontFamily: FONTS.display }]}>You're all set!</Text>
      <View style={[styles.summaryCard, { backgroundColor: p.surface }]}>
        <SummaryRow icon="calendar" text={`${year} vision board`} p={p} />
        <SummaryRow icon="chatbubble-ellipses" text={motto} p={p} />
        {filled.length > 0 && (
          <SummaryRow icon="flag" text={`${filled.length} goal${filled.length !== 1 ? 's' : ''} added`} p={p} />
        )}
      </View>
      <Text style={[styles.body, { color: p.muted }]}>
        Tap your goals to build them out, track progress, and get coaching.
      </Text>
    </View>
  );
}

function SummaryRow({ icon, text, p }: any) {
  return (
    <View style={styles.summaryRow}>
      <Ionicons name={icon} size={16} color={p.accent} />
      <Text style={[styles.summaryText, { color: p.text }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 32 },
  dot: { height: 8, width: 8, borderRadius: 4 },
  content: { flex: 1, paddingHorizontal: 28 },
  stepCenter: { alignItems: 'center', gap: 16 },
  iconCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 48 },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  heading: { fontSize: 30, fontWeight: '700', textAlign: 'center', lineHeight: 38 },
  bigTitle: { fontSize: 36, fontWeight: '700', textAlign: 'center' },
  subHeading: { fontSize: 18 },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22, paddingHorizontal: 10 },
  yearPicker: { flexDirection: 'row', alignItems: 'center', gap: 24, padding: 20, borderRadius: 20 },
  yearBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  yearNum: { fontSize: 44, fontWeight: '700', minWidth: 100, textAlign: 'center' },
  mottoInput: {
    width: '100%', borderRadius: 14, padding: 16, fontSize: 18,
    textAlign: 'center', borderWidth: 1, minHeight: 80,
  },
  goalInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalDot: { width: 12, height: 12, borderRadius: 6 },
  goalInput: { flex: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  summaryCard: { width: '100%', borderRadius: 14, padding: 16, gap: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryText: { fontSize: 14, flex: 1 },
  footer: { padding: 28, paddingTop: 0 },
  btn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  btnText: { fontSize: 17, fontWeight: '600' },
});
