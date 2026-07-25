import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Modal, Platform,
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

  const handleScratch = () => {
    const id = addGoal();
    onDismiss();
    router.push(`/goal/${id}`);
  };

  const handleTemplate = (t: GoalTemplate) => {
    const goal = instantiateTemplate(t, nextColorIndex());
    const id = addGoalFull(goal);
    onDismiss();
    router.push(`/goal/${id}`);
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
          onPress={handleScratch}
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
});
