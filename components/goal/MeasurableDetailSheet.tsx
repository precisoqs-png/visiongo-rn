import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Measurable, Goal } from '../../store/models';
import { Palette } from '../../theme/themes';
import { MeasurableCard } from './MeasurableCard';

interface Props {
  measurable: Measurable | null;
  // Required — passed straight through to MeasurableCard, which needs it
  // for measurableFraction. See its doc comment in store/models.ts.
  goal: Goal;
  goalTargetDate?: string;
  palette: Palette;
  // The parent goal's own color — passed straight through to MeasurableCard
  // so a bubble opened from the canvas edits in the same color it's shown
  // in, not the theme's flat accent tone.
  noteColor: string;
  onUpdate: (m: Measurable) => void;
  onDelete: (id: string) => void;
  onDismiss: () => void;
}

// What a tap on a canvas bubble opens — the same editable row a measurable
// gets in the old list view (MeasurableCard, unchanged), just surfaced in a
// modal since the bubble itself is too small for steppers/ladder weeks.
export function MeasurableDetailSheet({
  measurable, goal, goalTargetDate, palette: p, noteColor, onUpdate, onDelete, onDismiss,
}: Props) {
  return (
    <Modal visible={!!measurable} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { backgroundColor: p.bg }]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: p.text }]} numberOfLines={2}>
              {measurable?.label ?? ''}
            </Text>
            <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color={p.muted} />
            </TouchableOpacity>
          </View>
          {measurable && (
            <MeasurableCard
              measurable={measurable}
              goal={goal}
              goalTargetDate={goalTargetDate}
              palette={p}
              noteColor={noteColor}
              onUpdate={onUpdate}
              onDelete={(mid) => { onDelete(mid); onDismiss(); }}
            />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: '#00000070',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  sheet: { width: '100%', maxWidth: 460, borderRadius: 20, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  title: { flex: 1, fontSize: 16, fontWeight: '700' },
});
