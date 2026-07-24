import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Platform, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/useThemeStore';
import { useAppStore } from '../../store/useAppStore';
import { GOAL_NOTE_COLORS, hexAlpha, FONTS } from '../../theme/themes';
import { goalProgress, goalProgressPercent } from '../../store/models';
import { MeasurableCard } from '../../components/goal/MeasurableCard';
import { AddMeasurableForm } from '../../components/goal/AddMeasurableForm';
import { CoachChat } from '../../components/goal/CoachChat';

// Parse YYYY-MM-DD as a local date to avoid UTC-midnight timezone shift
function localDate(iso: string): Date {
  const [y, mo, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, mo - 1, d);
}

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = useThemeStore((s) => s.palette);
  const p = palette;

  const updateGoal = useAppStore((s) => s.updateGoal);
  const addMeasurable = useAppStore((s) => s.addMeasurable);
  const updateMeasurable = useAppStore((s) => s.updateMeasurable);
  const deleteMeasurable = useAppStore((s) => s.deleteMeasurable);
  const addSuggestionAsMeasurable = useAppStore((s) => s.addSuggestionAsMeasurable);
  const removeSuggestion = useAppStore((s) => s.removeSuggestion);

  // Reactive subscription so the component re-renders when store updates
  const goal = useAppStore((s) =>
    s.years.find((y) => y.year === s.selectedYear)?.goals.find((g) => g.id === id),
  );

  // Local draft for the title field so typing feels instant
  const [titleDraft, setTitleDraft] = useState(goal?.title ?? '');
  useEffect(() => {
    if (goal?.id) setTitleDraft(goal.title);
  }, [goal?.id]);

  // Native date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateDraft, setDateDraft] = useState('');

  // Web: ref to hidden <input type="date"> — opened imperatively via showPicker()
  const dateInputRef = useRef<any>(null);
  const openWebDatePicker = () => {
    if (!dateInputRef.current) return;
    // showPicker() is the modern API; .click() as fallback for older browsers
    if (typeof dateInputRef.current.showPicker === 'function') {
      dateInputRef.current.showPicker();
    } else {
      dateInputRef.current.click();
    }
  };

  if (!goal) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.bg }}>
        <Text style={{ color: p.muted }}>Goal not found</Text>
      </View>
    );
  }

  const noteColor = GOAL_NOTE_COLORS[goal.colorIndex % GOAL_NOTE_COLORS.length];
  const progress = goalProgress(goal);
  const pct = goalProgressPercent(goal);

  const daysLeft = goal.targetDate
    ? Math.max(0, Math.round((localDate(goal.targetDate).getTime() - Date.now()) / 86400000))
    : null;

  const dateDisplay = goal.targetDate
    ? localDate(goal.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'No date set';

  const openNativeDatePicker = () => {
    setDateDraft(goal.targetDate ?? '');
    setShowDatePicker(true);
  };

  const confirmNativeDate = () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateDraft)) {
      updateGoal({ ...goal, targetDate: dateDraft });
    }
    setShowDatePicker(false);
  };

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>

        <LinearGradient
          colors={[hexAlpha(noteColor, 0.4), hexAlpha(noteColor, 0.1)]}
          style={styles.headerGradient}
        >
          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={16} color={p.text} />
              <Text style={[styles.backText, { color: p.text }]}>Board</Text>
            </TouchableOpacity>
            <Text style={[styles.goalLabel, { color: p.muted }]}>GOAL · {useAppStore.getState().selectedYear}</Text>
            <TouchableOpacity
              onPress={() => updateGoal({ ...goal, reminder: { ...goal.reminder, on: !goal.reminder.on } })}
            >
              <Ionicons
                name={goal.reminder.on ? 'notifications' : 'notifications-outline'}
                size={20}
                color={goal.reminder.on ? p.accent : p.muted}
              />
            </TouchableOpacity>
          </View>

          <TextInput
            style={[styles.titleInput, { color: p.text }]}
            value={titleDraft}
            onChangeText={setTitleDraft}
            onBlur={() => titleDraft !== goal.title && updateGoal({ ...goal, title: titleDraft })}
            multiline
            placeholder="Goal title"
            placeholderTextColor={p.muted}
          />

          <View style={styles.progRow}>
            <View style={{ flex: 1 }}>
              <View style={[styles.progTrack, { backgroundColor: p.line }]}>
                <View style={[styles.progFill, { backgroundColor: p.accent, width: `${progress * 100}%` }]} />
              </View>
            </View>
            <Text style={[styles.progPct, { color: p.accent }]}>{pct}%</Text>
          </View>
        </LinearGradient>

        {/*
          ACHIEVE BY row — tappable to set a date.
          Web: TouchableOpacity calls showPicker() on a hidden <input type="date">
               via ref. This is more reliable than an opacity-0 overlay because
               RN Web's overflow:hidden can swallow pointer events on abs children.
          Native: opens a text-entry modal (YYYY-MM-DD).
        */}
        <TouchableOpacity
          style={[styles.achieveRow, { backgroundColor: p.surface }]}
          onPress={Platform.OS === 'web' ? openWebDatePicker : openNativeDatePicker}
          activeOpacity={0.75}
        >
          <Text style={[styles.eyebrow, { color: p.muted }]}>ACHIEVE BY</Text>
          <Text style={[styles.dateText, { color: p.text }]}>{dateDisplay}</Text>
          {daysLeft != null && (
            <Text style={[styles.daysLeft, { color: p.muted }]}>· {daysLeft} days left</Text>
          )}
          <Ionicons name="pencil-outline" size={13} color={p.muted} style={{ marginLeft: 'auto' as any }} />
          {Platform.OS === 'web' && (
            // @ts-ignore — raw HTML input, zero-sized and non-interactive;
            // opened imperatively by openWebDatePicker() via the ref above.
            <input
              ref={dateInputRef}
              type="date"
              value={goal.targetDate ?? ''}
              onChange={(e: any) =>
                updateGoal({ ...goal, targetDate: e.target.value || undefined })
              }
              style={{
                position: 'absolute',
                width: 0,
                height: 0,
                opacity: 0,
                pointerEvents: 'none',
                border: 'none',
              }}
            />
          )}
        </TouchableOpacity>

        <View style={styles.section}>
          {goal.measurables.length === 0 ? (
            <Text style={[styles.emptyHint, { color: p.muted }]}>
              No measurables yet. Add one below or ask your coach.
            </Text>
          ) : (
            goal.measurables.map((m) => (
              <MeasurableCard
                key={m.id}
                measurable={m}
                palette={p}
                onUpdate={(m) => updateMeasurable(m, goal.id)}
                onDelete={(mid) => deleteMeasurable(mid, goal.id)}
              />
            ))
          )}
        </View>

        {goal.suggestions.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.eyebrow, { color: p.muted }]}>SUGGESTED BY YOUR COACH</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                {goal.suggestions.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.suggestionChip, { borderColor: `${p.accent}80` }]}
                    onPress={() => addSuggestionAsMeasurable(s, goal.id)}
                  >
                    <Text style={[styles.suggestionText, { color: p.accent }]}>+ {s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <View style={styles.section}>
          <AddMeasurableForm
            goal={goal}
            palette={p}
            onAdd={(m) => addMeasurable(m, goal.id)}
          />
        </View>

        <View style={styles.section}>
          <CoachChat goal={goal} palette={p} />
        </View>
      </ScrollView>

      {/* Native date entry modal */}
      <Modal visible={showDatePicker} transparent animationType="fade">
        <View style={styles.dateOverlay}>
          <View style={[styles.dateModal, { backgroundColor: p.surface }]}>
            <Text style={[styles.eyebrow, { color: p.muted, marginBottom: 12 }]}>SET TARGET DATE</Text>
            <TextInput
              style={[styles.dateInput, { color: p.text, borderColor: p.line }]}
              placeholder="YYYY-MM-DD  (e.g. 2025-12-31)"
              placeholderTextColor={p.muted}
              value={dateDraft}
              onChangeText={setDateDraft}
              keyboardType="numbers-and-punctuation"
              autoFocus
            />
            <View style={styles.dateActions}>
              {goal.targetDate && (
                <TouchableOpacity
                  onPress={() => {
                    updateGoal({ ...goal, targetDate: undefined });
                    setShowDatePicker(false);
                  }}
                >
                  <Text style={{ color: '#c0392b', fontSize: 15 }}>Clear</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={{ color: p.muted, fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmNativeDate}>
                <Text style={{ color: p.accent, fontWeight: '600', fontSize: 15 }}>Set Date</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  headerGradient: { paddingBottom: 16 },
  navRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 14, fontWeight: '500' },
  goalLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  titleInput: {
    fontSize: 24, fontWeight: '700', fontFamily: FONTS.display,
    paddingHorizontal: 20, paddingBottom: 10,
    minHeight: 40,
  },
  progRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingBottom: 12,
  },
  progTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progFill: { height: 6, borderRadius: 3 },
  progPct: { fontSize: 13, fontWeight: '700', width: 36, textAlign: 'right' },
  achieveRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, paddingHorizontal: 20, gap: 8,
  },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  dateText: { fontSize: 14, fontWeight: '600' },
  daysLeft: { fontSize: 13 },
  section: { padding: 18 },
  emptyHint: { fontSize: 14, lineHeight: 20 },
  suggestionChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderStyle: 'dashed',
  },
  suggestionText: { fontSize: 13, fontWeight: '500' },
  dateOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  dateModal: { width: '100%', borderRadius: 16, padding: 20 },
  dateInput: {
    fontSize: 16, borderBottomWidth: 1,
    paddingVertical: 8, marginBottom: 20,
  },
  dateActions: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 18,
  },
});
