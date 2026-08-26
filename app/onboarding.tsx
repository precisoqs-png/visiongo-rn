import React, { useState, useRef, startTransition } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions, Animated, Platform, KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/useThemeStore';
import { useAppStore } from '../store/useAppStore';
import { GOAL_NOTE_COLORS, FONTS } from '../theme/themes';
import { TEMPLATE_CATEGORIES, GoalTemplate, instantiateTemplate } from '../store/goalTemplates';
import { Goal } from '../store/models';
import { ITEMS_SCHEMA_VERSION } from '../store/migration';
import { CalendarPicker } from '../components/shared/CalendarPicker';

const { width } = Dimensions.get('window');
const NOW = new Date().getFullYear();

// Stable identity for a selection BEFORE it becomes a real Goal (with its
// own id) — templates already have one, a custom goal gets one from its
// position in the running list (stable within a session: the goals step
// is behind you by the time these are used).
function templateKey(t: GoalTemplate): string {
  return `t-${t.id}`;
}
function customKey(i: number): string {
  return `c-${i}`;
}

// Resolves one goal's actual achieve-by date: an explicit per-goal entry
// wins if present at all — a string is that goal's own date, `null` is an
// explicit "no date" overriding a shared default that IS set — otherwise
// (the key is absent entirely) fall back to the shared default.
function resolveGoalDate(
  key: string,
  perGoalDates: Record<string, string | null>,
  defaultDate: string | undefined,
): string | undefined {
  if (!(key in perGoalDates)) return defaultDate;
  return perGoalDates[key] ?? undefined;
}

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
  // Custom goals the user has explicitly added (shown as a running,
  // checkmarked list, same as template selections) vs. the text currently
  // being typed but not yet added — kept separate so submitting the draft
  // never doubles as "advance to the next step".
  const [customGoals, setCustomGoals] = useState<string[]>([]);
  const [customGoalDraft, setCustomGoalDraft] = useState('');
  // 'YYYY-MM-DD', or undefined if skipped — the DEFAULT achieve-by date,
  // applied to any selected goal that hasn't been given its own override
  // below. A single shared date (the old behavior) made the plan wrong for
  // at least one goal the moment a session mixed different-horizon goals
  // (a marathon and a savings goal don't share a timeline) — a fast
  // sensible default with a per-goal override stays quick for the common
  // case (one date, tap Continue) without forcing that mismatch.
  const [targetDate, setTargetDate] = useState<string | undefined>(undefined);
  // Sparse — only entries the user explicitly gave their own setting.
  // Three-way per key, not two: an ABSENT key means "no override, use the
  // shared default"; an ISO date means "this goal's own date"; `null`
  // means "this goal explicitly has no date", overriding a shared default
  // that IS set. Without that third state, "clear this goal's date" had
  // nowhere to go but back to the shared default — there was no way to
  // say "every goal gets this date except this one, which gets none".
  // Keyed by goalKey(t)/customGoalKey(i) below.
  const [perGoalDates, setPerGoalDates] = useState<Record<string, string | null>>({});
  // Which date the CalendarPicker modal is currently editing: 'default' for
  // the shared date, a goal key for that one goal's override, or null (closed).
  const [editingDateFor, setEditingDateFor] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const STEPS = 6; // 0=welcome 1=year 2=motto 3=goals 4=deadline 5=ready

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

  // Adds the current draft to the running list — this is what Enter/submit
  // and the "+" button both call. It never advances the step; only the
  // Continue button does that.
  const addCustomGoal = () => {
    const trimmed = customGoalDraft.trim();
    if (!trimmed) return;
    setCustomGoals((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setCustomGoalDraft('');
  };

  const removeCustomGoal = (title: string) => {
    setCustomGoals((prev) => prev.filter((g) => g !== title));
  };

  const advance = () => {
    // Leaving the goals step with unsubmitted text in the draft field —
    // treat it the same as if the user had tapped "+"/pressed Enter, so
    // nothing typed is silently lost just because they tapped Continue
    // instead.
    if (step === 3 && customGoalDraft.trim()) {
      addCustomGoal();
    }
    if (step < STEPS - 1) {
      animate(() => setStep((s) => s + 1));
    } else {
      // Build Goal[] from selected templates + every added custom goal,
      // each stamped with ITS OWN achieve-by date: an explicit per-goal
      // override if the user set one, else the shared default, else none.
      // Applied so the coach's first reply never has to burn itself asking
      // the question onboarding should already have answered (see
      // deadlineInstruction in coachService.ts), and so anything ADDED
      // later against this goal (a ladder from the Measurables tab, a
      // Milestone deadline) has a real date to pace against. Resolved
      // BEFORE instantiateTemplate runs (not stamped onto the Goal
      // afterward) so a template's own build-up ramp — mkBuildUpMilestone/
      // buildCommitmentRamp in goalTemplates.ts — paces itself against
      // this real deadline instead of a fixed week count from today: a
      // 1-month deadline on a half-marathon template's fixed 10-week ramp
      // no longer runs past it.
      const goals: Goal[] = selectedTemplates.map((t, i) => {
        const date = resolveGoalDate(templateKey(t), perGoalDates, targetDate);
        return instantiateTemplate(t, i % GOAL_NOTE_COLORS.length, date);
      });
      customGoals.forEach((title, i) => {
        const date = resolveGoalDate(customKey(i), perGoalDates, targetDate);
        goals.push({
          id: require('../store/models').newId(),
          title,
          colorIndex: goals.length % GOAL_NOTE_COLORS.length,
          reminder: { on: false, frequency: 'Daily' },
          chat: [],
          pendingActions: [],
          items: [],
          ...(date ? { targetDate: date } : {}),
          // Stamped so a Milestone/Measurable added in this same session
          // (before the next rehydrate ever runs normalizeYears) isn't
          // mistaken for pre-v6 legacy data and re-inverted — see
          // invertItemsForGoal's goal-level short-circuit in store/migration.ts.
          itemsSchema: ITEMS_SCHEMA_VERSION,
        });
      });
      const effectiveMotto = motto.trim() || 'Dream it. Plan it. Live it.';
      completeOnboarding(selectedYear, effectiveMotto, goals);
      navigateToBoard();
    }
  };

  const skip = () => {
    completeOnboarding(NOW, 'Dream it. Plan it. Live it.', []);
    navigateToBoard();
  };

  // Mounting the board here means mounting RadialBoard, the tab bar, and
  // everything under it — a large commit that, profiled with Chrome's CPU
  // throttling, ran 1000ms+ under a 10x slowdown (roughly matching the
  // reported ~2.1s INP trace). React's commit phase is never interruptible
  // even inside startTransition, so the fix isn't to make that work faster —
  // it's to make sure it doesn't run inside THIS input's handler at all.
  // Deferring to a macrotask lets the browser paint a frame first (ending
  // this interaction quickly), and startTransition inside it still lets
  // React yield during the subsequent render/reconciliation work.
  const navigateToBoard = () => {
    setTimeout(() => {
      startTransition(() => {
        router.replace('/(tabs)/board');
      });
    }, 0);
  };

  const toggleTemplate = (t: GoalTemplate) => {
    setSelectedTemplates((prev) =>
      prev.find((x) => x.id === t.id)
        ? prev.filter((x) => x.id !== t.id)
        : [...prev, t]
    );
  };

  const totalSelected = selectedTemplates.length + customGoals.length;

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

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
            customGoals={customGoals}
            customGoalDraft={customGoalDraft}
            onDraftChange={setCustomGoalDraft}
            onAddCustom={addCustomGoal}
            onRemoveCustom={removeCustomGoal}
            totalSelected={totalSelected}
          />
        )}
        {step === 4 && (
          <DeadlineStep
            p={p} year={selectedYear} targetDate={targetDate}
            onSetTargetDate={setTargetDate}
            onOpenPicker={() => setEditingDateFor('default')}
            selectedTemplates={selectedTemplates}
            customGoals={customGoals}
            perGoalDates={perGoalDates}
            onOpenGoalPicker={(key: string) => setEditingDateFor(key)}
            onClearGoalOverride={(key: string) => setPerGoalDates((prev) => {
              const next = { ...prev };
              delete next[key];
              return next;
            })}
            onSkip={() => { setTargetDate(undefined); setPerGoalDates({}); advance(); }}
          />
        )}
        {step === 5 && (
          <ReadyStep
            p={p} year={selectedYear} motto={motto || 'Dream it. Plan it. Live it.'}
            selectedTemplates={selectedTemplates}
            customGoals={customGoals}
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
      </KeyboardAvoidingView>

      <CalendarPicker
        visible={editingDateFor != null}
        value={editingDateFor === 'default' ? targetDate : (editingDateFor ? resolveGoalDate(editingDateFor, perGoalDates, targetDate) : undefined)}
        palette={p}
        onSelect={(iso) => {
          if (editingDateFor === 'default') setTargetDate(iso);
          else if (editingDateFor) setPerGoalDates((prev) => ({ ...prev, [editingDateFor]: iso }));
          setEditingDateFor(null);
        }}
        onClear={() => {
          if (editingDateFor === 'default') {
            setTargetDate(undefined);
          } else if (editingDateFor) {
            // Explicit "this goal has no date" (null) — distinct from
            // removing the key entirely (the pill's own long-press,
            // "revert to the shared default"). Without this, clearing a
            // per-goal date always fell back to the default, with no way
            // to say "every goal gets this date except this one".
            setPerGoalDates((prev) => ({ ...prev, [editingDateFor]: null }));
          }
          setEditingDateFor(null);
        }}
        onDismiss={() => setEditingDateFor(null)}
      />
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

function GoalsStep({
  p, selectedTemplates, onToggle,
  customGoals, customGoalDraft, onDraftChange, onAddCustom, onRemoveCustom,
  totalSelected,
}: any) {
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
            the user sees rather than buried after every template category.
            Submitting (Enter, or the + button) ADDS to the list below —
            it never advances the step; only Continue does that. */}
        <Text style={[styles.catHeader, { color: p.muted }]}>OR WRITE YOUR OWN</Text>
        <View style={styles.customInputRow}>
          <TextInput
            style={[
              styles.customInput,
              { flex: 1, backgroundColor: p.surface, color: p.text, borderColor: p.line },
            ]}
            placeholder="e.g. Start a podcast…"
            placeholderTextColor={p.muted}
            value={customGoalDraft}
            onChangeText={onDraftChange}
            onSubmitEditing={onAddCustom}
            blurOnSubmit={false}
            returnKeyType="done"
          />
          <TouchableOpacity
            onPress={onAddCustom}
            disabled={!customGoalDraft.trim()}
            style={[
              styles.customAddBtn,
              { backgroundColor: customGoalDraft.trim() ? p.accent : p.line },
            ]}
          >
            <Ionicons name="add" size={20} color={customGoalDraft.trim() ? '#fff' : p.muted} />
          </TouchableOpacity>
        </View>

        {customGoals.map((title: string) => (
          <TouchableOpacity
            key={title}
            style={[styles.templateRow, { borderColor: p.accent, backgroundColor: `${p.accent}12` }]}
            onPress={() => onRemoveCustom(title)}
          >
            <Text style={styles.templateEmoji}>✏️</Text>
            <Text style={[styles.templateTitle, { color: p.text, flex: 1 }]}>{title}</Text>
            <View style={[styles.check, { borderColor: p.accent, backgroundColor: p.accent }]}>
              <Ionicons name="checkmark" size={13} color={p.isDark ? p.bg : '#fff'} />
            </View>
          </TouchableOpacity>
        ))}

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

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function DeadlineStep({
  p, year, targetDate, onSetTargetDate, onOpenPicker, onSkip,
  selectedTemplates, customGoals, perGoalDates, onOpenGoalPicker, onClearGoalOverride,
}: any) {
  const threeMonths = () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return toISO(d);
  };
  const sixMonths = () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return toISO(d);
  };
  const endOfYear = () => toISO(new Date(year, 11, 31));

  const chips: { label: string; value: string }[] = [
    { label: '3 months', value: threeMonths() },
    { label: '6 months', value: sixMonths() },
    { label: `End of ${year}`, value: endOfYear() },
  ];

  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  // Same identity scheme used to build the real Goal[] in advance() —
  // templates keep their own id, a custom goal is keyed by its position.
  const goalRows: { key: string; emoji: string; title: string }[] = [
    ...selectedTemplates.map((t: GoalTemplate) => ({ key: `t-${t.id}`, emoji: t.emoji, title: t.title })),
    ...customGoals.map((title: string, i: number) => ({ key: `c-${i}`, emoji: '✏️', title })),
  ];

  return (
    <ScrollView contentContainerStyle={styles.stepCenter} keyboardShouldPersistTaps="handled">
      <Text style={[styles.eyebrow, { color: p.muted }]}>STEP 4 OF 4</Text>
      <Text style={[styles.heading, { color: p.text }]}>When do you want{"\n"}to achieve this by?</Text>
      <Text style={[styles.body, { color: p.muted }]}>
        A default for every goal — tap any goal below to give it its own date instead.
      </Text>
      <View style={styles.chipGrid}>
        {chips.map((c) => {
          const active = targetDate === c.value;
          return (
            <TouchableOpacity
              key={c.label}
              style={[
                styles.mottoChip,
                { borderColor: active ? p.accent : p.line, backgroundColor: active ? `${p.accent}18` : p.surface },
              ]}
              onPress={() => onSetTargetDate(active ? undefined : c.value)}
            >
              <Text style={[styles.mottoChipText, { color: active ? p.accent : p.text }]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[
            styles.mottoChip,
            {
              borderColor: targetDate && !chips.some((c) => c.value === targetDate) ? p.accent : p.line,
              backgroundColor: targetDate && !chips.some((c) => c.value === targetDate) ? `${p.accent}18` : p.surface,
            },
          ]}
          onPress={onOpenPicker}
        >
          <Text style={[
            styles.mottoChipText,
            { color: targetDate && !chips.some((c) => c.value === targetDate) ? p.accent : p.text },
          ]}>
            {targetDate && !chips.some((c) => c.value === targetDate)
              ? new Date(targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : 'Pick a date'}
          </Text>
        </TouchableOpacity>
      </View>

      {goalRows.length > 0 && (
        <View style={styles.perGoalDateList}>
          {goalRows.map((g) => {
            // Has its OWN explicit setting — a date, or an explicit "no
            // date" (null) — as opposed to no entry at all (falls back to
            // the shared default).
            const hasOverride = g.key in perGoalDates;
            const resolved = resolveGoalDate(g.key, perGoalDates, targetDate);
            return (
              <View key={g.key} style={[styles.perGoalDateRow, { borderColor: p.line }]}>
                <Text style={styles.templateEmoji}>{g.emoji}</Text>
                <Text style={[styles.templateTitle, { color: p.text, flex: 1 }]} numberOfLines={1}>
                  {g.title}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.perGoalDatePill,
                    { borderColor: hasOverride ? p.accent : p.line, backgroundColor: hasOverride ? `${p.accent}18` : 'transparent' },
                  ]}
                  onPress={() => onOpenGoalPicker(g.key)}
                  onLongPress={hasOverride ? () => onClearGoalOverride(g.key) : undefined}
                >
                  <Text style={[styles.perGoalDatePillText, { color: hasOverride ? p.accent : p.muted }]}>
                    {fmtDate(resolved) ?? 'No date'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
          <Text style={[styles.perGoalHint, { color: p.muted }]}>
            Tap a goal's date to give it its own; hold to clear back to the default.
          </Text>
        </View>
      )}

      <TouchableOpacity onPress={onSkip} style={styles.skipBtn}>
        <Text style={[styles.skipText, { color: p.muted }]}>Skip for now</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function ReadyStep({ p, year, motto, selectedTemplates, customGoals }: any) {
  const allTitles: { emoji: string; title: string; colorIndex: number }[] = [
    ...selectedTemplates.map((t: GoalTemplate, i: number) => ({
      emoji: t.emoji, title: t.title, colorIndex: i,
    })),
    ...customGoals.map((title: string, i: number) => ({
      emoji: '✏️', title, colorIndex: selectedTemplates.length + i,
    })),
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
  // Deadline step — per-goal date overrides
  perGoalDateList: { width: '100%', marginTop: 6 },
  perGoalDateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderBottomWidth: 1, paddingVertical: 10,
  },
  perGoalDatePill: {
    borderWidth: 1, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10,
  },
  perGoalDatePillText: { fontSize: 12, fontWeight: '600' },
  perGoalHint: { fontSize: 11, textAlign: 'center', marginTop: 10, lineHeight: 15 },
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
  customInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 10,
  },
  customInput: {
    borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15,
  },
  customAddBtn: {
    width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
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
