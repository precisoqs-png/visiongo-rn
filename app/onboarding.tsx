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
import { TEMPLATE_CATEGORIES, GoalTemplate, instantiateTemplate } from '../store/goalTemplates';
import { Goal } from '../store/models';

const { width } = Dimensions.get('window');
const NOW = new Date().getFullYear();

const MOTTO_CHIPS = [
  'MY YEAR OF MOMENTUM',
  'MY YEAR OF GROWTH',
  'MY YEAR OF BALANCE',
  'MY YEAR OF COURAGE',
  'LESS, BUT BETTER',
];

export default function OnboardingScreen() {
  const router = useRouter();
  const palette = useThemeStore((s) => s.palette);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const p = palette;

  const [step, setStep] = useState(0);
  const [selectedYear, setSelectedYear] = useState(NOW);
  const [motto, setMotto] = useState('');
  const [selectedTemplates, setSelectedTemplates] = useState<GoalTemplate[]>([]);
  const [customGoalTitle, setCustomGoalTitle] = useState('');

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const STEPS = 5; // 0=welcome 1=year 2=motto 3=goals 4=ready

  const animate = (cb: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      cb();
      slideAnim.setValue(20);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  };

  const advance = () => {
    if (step < STEPS - 1) {
      animate(() => setStep((s) => s + 1));
    } else {
      // Build Goal[] from selected templates + optional custom title
      const goals: Goal[] = selectedTemplates.map((t, i) =>
        instantiateTemplate(t, i % GOAL_NOTE_COLORS.length)
      );
      const trimmed = customGoalTitle.trim();
      if (trimmed) {
        goals.push({
          id: require('../store/models').newId(),
          title: trimmed,
          colorIndex: goals.length % GOAL_NOTE_COLORS.length,
          reminder: { on: false, frequency: 'Daily' },
          chat: [],
          pendingActions: [],
          measurables: [],
          milestones: [],
        });
      }
      const effectiveMotto = motto.trim() || 'Dream it. Plan it. Live it.';
      completeOnboarding(selectedYear, effectiveMotto, goals);
      router.replace('/(tabs)/board');
    }
  };

  const skip = () => {
    completeOnboarding(NOW, 'Dream it. Plan it. Live it.', []);
    router.replace('/(tabs)/board');
  };

  const toggleTemplate = (t: GoalTemplate) => {
    setSelectedTemplates((prev) =>
      prev.find((x) => x.id === t.id)
        ? prev.filter((x) => x.id !== t.id)
        : [...prev, t]
    );
  };

  const totalSelected = selectedTemplates.length + (customGoalTitle.trim() ? 1 : 0);

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      {/* Progress dots */}
      <View style={styles.dots}>
        {Array.from({ length: STEPS }).map((_, i) => (
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
        {step === 0 && <WelcomeStep p={p} onSkip={skip} />}
        {step === 1 && (
          <YearStep p={p} selectedYear={selectedYear} onYearChange={setSelectedYear} />
        )}
        {step === 2 && (
          <MottoStep
            p={p} motto={motto} onMottoChange={setMotto} year={selectedYear}
          />
        )}
        {step === 3 && (
          <GoalsStep
            p={p}
            selectedTemplates={selectedTemplates}
            onToggle={toggleTemplate}
            customGoalTitle={customGoalTitle}
            onCustomChange={setCustomGoalTitle}
            totalSelected={totalSelected}
          />
        )}
        {step === 4 && (
          <ReadyStep
            p={p} year={selectedYear} motto={motto || 'Dream it. Plan it. Live it.'}
            selectedTemplates={selectedTemplates}
            customGoalTitle={customGoalTitle}
          />
        )}
      </Animated.View>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.btn, { backgroundColor: p.ink }]} onPress={advance}>
          <Text style={[styles.btnText, { color: p.isDark ? p.bg : '#fff' }]}>
            {step === STEPS - 1 ? "Open my board" : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

function WelcomeStep({ p, onSkip }: { p: any; onSkip: () => void }) {
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
      <TouchableOpacity onPress={onSkip} style={styles.skipBtn}>
        <Text style={[styles.skipText, { color: p.muted }]}>Skip for now</Text>
      </TouchableOpacity>
    </View>
  );
}

function YearStep({ p, selectedYear, onYearChange }: any) {
  const chips = [NOW, NOW + 1, NOW + 2];
  return (
    <View style={styles.stepCenter}>
      <Text style={[styles.eyebrow, { color: p.muted }]}>STEP 1 OF 4</Text>
      <Text style={[styles.heading, { color: p.text }]}>What year are{"\n"}you planning?</Text>
      <Text style={[styles.body, { color: p.muted }]}>This becomes the center of your vision board.</Text>
      <View style={styles.chipRow}>
        {chips.map((yr) => {
          const active = selectedYear === yr;
          return (
            <TouchableOpacity
              key={yr}
              style={[
                styles.yearChip,
                { borderColor: active ? p.accent : p.line, backgroundColor: active ? `${p.accent}18` : p.surface },
              ]}
              onPress={() => onYearChange(yr)}
            >
              <Text style={[
                styles.yearChipText,
                { color: active ? p.accent : p.text, fontFamily: FONTS.display },
              ]}>
                {yr}
              </Text>
              {active && (
                <View style={[styles.yearChipRing, { borderColor: p.accent }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function MottoStep({ p, motto, onMottoChange, year }: any) {
  return (
    <ScrollView contentContainerStyle={styles.stepCenter} keyboardShouldPersistTaps="handled">
      <Text style={[styles.eyebrow, { color: p.muted }]}>STEP 2 OF 4</Text>
      <Text style={[styles.heading, { color: p.text }]}>Set your theme for {year}</Text>
      <Text style={[styles.body, { color: p.muted }]}>Pick one or write your own.</Text>
      <View style={styles.chipGrid}>
        {MOTTO_CHIPS.map((chip) => {
          const active = motto === chip;
          return (
            <TouchableOpacity
              key={chip}
              style={[
                styles.mottoChip,
                { borderColor: active ? p.accent : p.line, backgroundColor: active ? `${p.accent}18` : p.surface },
              ]}
              onPress={() => onMottoChange(active ? '' : chip)}
            >
              <Text style={[styles.mottoChipText, { color: active ? p.accent : p.text }]}>{chip}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TextInput
        style={[styles.mottoInput, { backgroundColor: p.surface, color: p.text, borderColor: p.line }]}
        value={motto}
        onChangeText={(t) => { if (t.length <= 80) onMottoChange(t); }}
        multiline
        maxLength={80}
        placeholder="Or write your own motto…"
        placeholderTextColor={p.muted}
      />
      <Text style={[{ color: p.muted, fontSize: 11, alignSelf: 'flex-end' }]}>{motto.length} / 80</Text>
    </ScrollView>
  );
}

function GoalsStep({ p, selectedTemplates, onToggle, customGoalTitle, onCustomChange, totalSelected }: any) {
  const isSelected = (t: GoalTemplate) => selectedTemplates.some((x: GoalTemplate) => x.id === t.id);
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.stepCenter, { marginBottom: 12 }]}>
        <Text style={[styles.eyebrow, { color: p.muted }]}>STEP 3 OF 4</Text>
        <Text style={[styles.heading, { color: p.text }]}>Create your vision</Text>
        <Text style={[styles.body, { color: p.muted }]}>Pick templates to start with. You can customize everything later.</Text>
        {totalSelected > 0 && (
          <View style={[styles.counter, { backgroundColor: `${p.accent}22` }]}>
            <Text style={[styles.counterText, { color: p.accent }]}>
              {totalSelected} {totalSelected === 1 ? 'goal' : 'goals'} selected
            </Text>
          </View>
        )}
      </View>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Write your own — first thing in the list, so it's the first thing
            the user sees rather than buried after every template category. */}
        <Text style={[styles.catHeader, { color: p.muted }]}>OR WRITE YOUR OWN</Text>
        <TextInput
          style={[
            styles.customInput,
            { backgroundColor: p.surface, color: p.text, borderColor: p.line },
          ]}
          placeholder="e.g. Start a podcast…"
          placeholderTextColor={p.muted}
          value={customGoalTitle}
          onChangeText={onCustomChange}
        />

        {TEMPLATE_CATEGORIES.map((cat) => (
          <View key={cat.name} style={styles.catSection}>
            <Text style={[styles.catHeader, { color: p.muted }]}>{cat.name.toUpperCase()}</Text>
            {cat.templates.map((t) => {
              const sel = isSelected(t);
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[
                    styles.templateRow,
                    { borderColor: sel ? p.accent : p.line, backgroundColor: sel ? `${p.accent}12` : p.surface },
                  ]}
                  onPress={() => onToggle(t)}
                >
                  <Text style={styles.templateEmoji}>{t.emoji}</Text>
                  <Text style={[styles.templateTitle, { color: p.text, flex: 1 }]}>{t.title}</Text>
                  <View style={[
                    styles.check,
                    { borderColor: sel ? p.accent : p.line, backgroundColor: sel ? p.accent : 'transparent' },
                  ]}>
                    {sel && <Ionicons name="checkmark" size={13} color={p.isDark ? p.bg : '#fff'} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

function ReadyStep({ p, year, motto, selectedTemplates, customGoalTitle }: any) {
  const custom = customGoalTitle.trim();
  const allTitles: { emoji: string; title: string; colorIndex: number }[] = [
    ...selectedTemplates.map((t: GoalTemplate, i: number) => ({
      emoji: t.emoji, title: t.title, colorIndex: i,
    })),
    ...(custom ? [{ emoji: '✏️', title: custom, colorIndex: selectedTemplates.length }] : []),
  ];
  return (
    <ScrollView contentContainerStyle={styles.stepCenter}>
      <View style={[styles.readyRing, { borderColor: p.accent }]}>
        <Ionicons name="checkmark" size={40} color={p.accent} />
      </View>
      <Text style={[styles.bigTitle, { color: p.text, fontFamily: FONTS.display }]}>You're all set!</Text>
      <Text style={[styles.mottoRecap, { color: p.muted }]}>{motto}</Text>
      {allTitles.length > 0 && (
        <View style={[styles.recapCard, { backgroundColor: p.surface }]}>
          {allTitles.map((g, i) => (
            <View key={i} style={styles.recapRow}>
              <View style={[styles.recapDot, { backgroundColor: GOAL_NOTE_COLORS[g.colorIndex % GOAL_NOTE_COLORS.length] }]} />
              <Text style={styles.recapEmoji}>{g.emoji}</Text>
              <Text style={[styles.recapTitle, { color: p.text }]}>{g.title}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={[styles.body, { color: p.muted }]}>
        Tap your goals to build them out, track progress, and get coaching.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  dot: { height: 8, width: 8, borderRadius: 4 },
  content: { flex: 1, paddingHorizontal: 24 },
  stepCenter: { alignItems: 'center', gap: 14 },
  iconCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 48 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  heading: { fontSize: 28, fontWeight: '700', textAlign: 'center', lineHeight: 36 },
  bigTitle: { fontSize: 34, fontWeight: '700', textAlign: 'center' },
  subHeading: { fontSize: 18 },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22, paddingHorizontal: 8 },
  skipBtn: { marginTop: 8, padding: 8 },
  skipText: { fontSize: 14, textDecorationLine: 'underline' },
  // Year chips
  chipRow: { flexDirection: 'row', gap: 12 },
  yearChip: {
    position: 'relative',
    width: 90, height: 90, borderRadius: 16, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  yearChipText: { fontSize: 22, fontWeight: '700' },
  yearChipRing: {
    position: 'absolute', inset: -4, borderRadius: 20, borderWidth: 2,
  },
  // Motto chips
  chipGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  mottoChip: {
    borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14,
  },
  mottoChipText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  mottoInput: {
    width: '100%', borderRadius: 14, padding: 14, fontSize: 16,
    textAlign: 'center', borderWidth: 1, minHeight: 70, marginTop: 4,
  },
  // Goals step
  counter: { borderRadius: 20, paddingVertical: 6, paddingHorizontal: 16 },
  counterText: { fontSize: 13, fontWeight: '700' },
  catSection: { marginBottom: 4 },
  catHeader: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 10, marginBottom: 4 },
  templateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 6,
  },
  templateEmoji: { fontSize: 20, width: 28 },
  templateTitle: { fontSize: 14, fontWeight: '500' },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  customInput: {
    borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15, marginTop: 2,
  },
  // Ready step
  readyRing: {
    width: 90, height: 90, borderRadius: 45, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  mottoRecap: { fontSize: 15, fontStyle: 'italic', textAlign: 'center' },
  recapCard: { width: '100%', borderRadius: 14, padding: 14, gap: 8 },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recapDot: { width: 10, height: 10, borderRadius: 5 },
  recapEmoji: { fontSize: 16 },
  recapTitle: { fontSize: 14, fontWeight: '500', flex: 1 },
  footer: { padding: 24, paddingTop: 0 },
  btn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  btnText: { fontSize: 17, fontWeight: '600' },
});
