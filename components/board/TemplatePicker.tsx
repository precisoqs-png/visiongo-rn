import React, { useEffect, useRef, useState, startTransition } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Modal, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store/useAppStore';
import { TEMPLATE_CATEGORIES, instantiateTemplate, GoalTemplate } from '../../store/goalTemplates';
import { GOAL_NOTE_COLORS } from '../../theme/themes';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  palette: any;
}

export function TemplatePicker({ visible, onDismiss, palette }: Props) {
  const p = palette;
  const router = useRouter();
  const addGoal = useAppStore((s) => s.addGoal);
  const addGoalFull = useAppStore((s) => s.addGoalFull);
  const years = useAppStore((s) => s.years);
  const selectedYear = useAppStore((s) => s.selectedYear);

  const nextColorIndex = () => {
    const yd = years.find((y) => y.year === selectedYear);
    return (yd?.goals.length ?? 0) % GOAL_NOTE_COLORS.length;
  };

  // Guards against a goal being created twice from a single tap — e.g. a
  // touch+click double-fire on some mobile browsers, or a fast re-tap before
  // the sheet has visually dismissed. Reset whenever the sheet opens fresh,
  // and set BEFORE any state mutation so even a synchronous re-entrant call
  // in the same tick is blocked, not just a later one.
  const committedRef = useRef(false);
  // "Start from scratch" used to create a "New Goal" and persist it the
  // instant it was tapped — cancelling out (navigating away) left it on
  // the board forever, and it's the very first action a new user takes.
  // Now it swaps this sheet's content for a name prompt instead; nothing
  // is created until Create is actually pressed.
  const [naming, setNaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  useEffect(() => {
    if (visible) {
      committedRef.current = false;
      setNaming(false);
      setDraftTitle('');
    }
  }, [visible]);

  // Navigation used to fire in the SAME tick as onDismiss(), right next to
  // it — this sheet's own Modal (react-native-web) only ever unmounts once
  // its CSS exit animation fires a real `animationend` DOM event (see
  // ModalAnimation.js); it does not unmount on `visible` flipping false by
  // itself. Immediately mounting the goal canvas underneath — a much
  // heavier commit for a template with a build-up ramp, which is exactly
  // what got heavier once this rendered its own outdated/overrun checks —
  // can occupy the main thread through the frame the exit animation needed
  // to actually run, so the browser never fires `animationend` and this
  // sheet's div is left mounted (invisible, but still in the DOM) forever.
  // Same root cause, same fix already used for the SAME class of problem
  // in onboarding.tsx's navigateToBoard: defer the heavy work to the next
  // macrotask so the browser paints the dismissal first.
  const navigateAfterDismiss = (id: string) => {
    onDismiss();
    setTimeout(() => {
      startTransition(() => {
        router.navigate(`/board/goal/${id}`);
      });
    }, 0);
  };

  const handleCreateScratch = () => {
    const title = draftTitle.trim();
    if (!title || committedRef.current) return;
    committedRef.current = true;
    const id = addGoal(title);
    navigateAfterDismiss(id);
  };

  const handleTemplate = (t: GoalTemplate) => {
    if (committedRef.current) return;
    committedRef.current = true;
    const goal = instantiateTemplate(t, nextColorIndex());
    const id = addGoalFull(goal);
    navigateAfterDismiss(id);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      {/* Scrim — sibling before sheet so sheet renders on top */}
      <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={onDismiss} />

      <View style={[styles.sheet, { backgroundColor: p.surface }]}>
        {/* Grab handle */}
        <View style={[styles.handle, { backgroundColor: p.line }]} />

        {naming ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.namingHeader}>
              <TouchableOpacity
                onPress={() => setNaming(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Back to templates"
              >
                <Ionicons name="chevron-back" size={20} color={p.text} />
              </TouchableOpacity>
              <Text style={[styles.sheetSub, { color: p.text, marginTop: 0, marginBottom: 0 }]}>
                Name your goal
              </Text>
              <View style={{ width: 20 }} />
            </View>
            <TextInput
              autoFocus
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="e.g. Learn to surf"
              placeholderTextColor={p.muted}
              style={[styles.nameInput, { backgroundColor: p.bg, color: p.text, borderColor: p.line }]}
              returnKeyType="done"
              onSubmitEditing={handleCreateScratch}
            />
            <TouchableOpacity
              style={[
                styles.createBtn,
                { backgroundColor: draftTitle.trim() ? p.accent : p.line },
              ]}
              onPress={handleCreateScratch}
              disabled={!draftTitle.trim()}
              accessibilityRole="button"
              accessibilityLabel="Create goal"
              accessibilityState={{ disabled: !draftTitle.trim() }}
            >
              <Text style={[styles.createBtnText, { color: p.isDark ? p.bg : '#fff' }]}>Create</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        ) : (
          <>
            <Text style={[styles.sheetTitle, { color: p.muted }]}>ADD A GOAL</Text>
            <Text style={[styles.sheetSub, { color: p.text }]}>Start from a template</Text>

            {/*
              "Start from scratch" lives OUTSIDE the ScrollView so its touch target
              can never overlap with any template row. On RN Web the animated Modal
              slide can offset internal scroll-item hit-rects, which caused taps on
              this button to land on the first template below it instead.
            */}
            <TouchableOpacity
              style={[styles.row, styles.scratchRow, { borderColor: p.accent }, styles.scratchOuter]}
              onPress={() => setNaming(true)}
              accessibilityRole="button"
              accessibilityLabel="Start a goal from scratch"
            >
              <View style={[styles.rowIcon, { backgroundColor: `${p.accent}22` }]}>
                <Ionicons name="add" size={20} color={p.accent} />
              </View>
              <Text style={[styles.rowTitle, { color: p.accent }]}>Start from scratch</Text>
              <Ionicons name="chevron-forward" size={16} color={p.accent} />
            </TouchableOpacity>

            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {TEMPLATE_CATEGORIES.map((cat) => (
                <View key={cat.name} style={styles.category}>
                  <Text style={[styles.catHeader, { color: p.muted }]}>{cat.name.toUpperCase()}</Text>
                  {cat.templates.map((t) => (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.row, { borderColor: p.line }]}
                      onPress={() => handleTemplate(t)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add goal from template: ${t.title}, ${t.stepCount} ${t.stepCount === 1 ? 'step' : 'steps'}`}
                    >
                      <Text style={styles.rowEmoji}>{t.emoji}</Text>
                      <View style={styles.rowMeta}>
                        <Text style={[styles.rowTitle, { color: p.text }]}>{t.title}</Text>
                        <Text style={[styles.rowSteps, { color: p.muted }]}>
                          {t.stepCount} {t.stepCount === 1 ? 'step' : 'steps'}
                        </Text>
                      </View>
                      <Ionicons name="add-circle-outline" size={22} color={p.muted} />
                    </TouchableOpacity>
                  ))}
                </View>
              ))}

              <View style={{ height: 32 }} />
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingTop: 12,
    paddingHorizontal: 20,
    // The last template row (and its ScrollView spacer below) previously
    // ended right at the sheet's own bottom:0 edge — flush against a
    // device's home-indicator/safe-area with no breathing room.
    paddingBottom: 20,
    ...(Platform.OS === 'web' ? { maxWidth: 480, alignSelf: 'center', width: '100%' } : {}),
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 11, fontWeight: '700', letterSpacing: 2, textAlign: 'center',
  },
  sheetSub: {
    fontSize: 18, fontWeight: '700', textAlign: 'center', marginTop: 4, marginBottom: 12,
  },
  scratchOuter: { marginBottom: 4 },
  list: { flex: 1 },
  category: { marginBottom: 8 },
  catHeader: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.5,
    marginTop: 12, marginBottom: 6,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 8,
  },
  scratchRow: { borderStyle: 'dashed' },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowEmoji: { fontSize: 24, width: 36, textAlign: 'center' },
  rowMeta: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSteps: { fontSize: 12, marginTop: 1 },
  namingHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 16,
  },
  nameInput: {
    borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 16,
  },
  createBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  createBtnText: { fontSize: 15, fontWeight: '700' },
});
