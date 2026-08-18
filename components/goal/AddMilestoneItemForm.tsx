import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TrackableItem, newMilestone } from '../../store/models';
import { Palette } from '../../theme/themes';
import { CalendarPickerContent } from '../shared/CalendarPicker';

interface Props {
  palette: Palette;
  goalTargetDate?: string;
  onAdd: (m: TrackableItem) => void;
}

// Manual "add a milestone" form — a big binary win: title + optional
// deadline only, no target/unit/step. Its quantified Measurables (if any)
// get added separately, under it, from measurables.tsx.
export function AddMilestoneItemForm({ palette: p, goalTargetDate, onAdd }: Props) {
  const [label, setLabel] = useState('');
  const [deadline, setDeadline] = useState<string | undefined>(goalTargetDate);
  const [showPicker, setShowPicker] = useState(false);

  const commit = () => {
    const t = label.trim();
    if (!t) return;
    const m = newMilestone({
      label: t,
      deadline,
      // Only tracked as "borrowed" from the goal while it still matches —
      // see isItemDeadlineOutdated in models.ts.
      sizedForGoalDate: deadline === goalTargetDate ? goalTargetDate : undefined,
    });
    onAdd(m);
    setLabel('');
  };

  // Renders the calendar INLINE — swapping this card's own body for it —
  // rather than presenting CalendarPicker's Modal. This form is embedded
  // directly on milestones.tsx (no Modal there, so a Modal picker would
  // have been harmless) but ALSO inside index.tsx's own add-milestone
  // sheet Modal, where presenting a second Modal on top of the first is
  // the same iOS modal-stacking freeze fixed elsewhere in this codebase.
  // Always going inline, regardless of which screen embeds this form,
  // means this component can never be the one that reintroduces it.
  if (showPicker) {
    return (
      <View style={[styles.card, { backgroundColor: `${p.surface}99` }]}>
        <CalendarPickerContent
          value={deadline}
          palette={p}
          onSelect={(iso) => { setDeadline(iso); setShowPicker(false); }}
          onClear={() => { setDeadline(undefined); setShowPicker(false); }}
          onDismiss={() => setShowPicker(false)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: `${p.surface}99` }]}>
      <Text style={[styles.eyebrow, { color: p.muted }]}>ADD YOUR OWN</Text>

      <TextInput
        style={[styles.input, { backgroundColor: p.surface, color: p.text, borderColor: p.line }]}
        placeholder="Milestone — e.g. Save $10,000"
        placeholderTextColor={p.muted}
        value={label}
        onChangeText={setLabel}
      />

      <Text style={[styles.fieldHint, { color: p.muted }]}>
        A big binary win — no number to hit here. Give it a deadline below, then add its
        Measurables (numbers, ladders, recurring commitments) from the Measurables tab.
      </Text>

      <TouchableOpacity style={[styles.dateRow, { borderColor: p.line }]} onPress={() => setShowPicker(true)}>
        <Ionicons name="calendar-outline" size={14} color={p.muted} />
        <Text style={[styles.dateText, { color: deadline ? p.text : p.muted }]}>
          {deadline
            ? new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Deadline (optional)'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.addBtn, { backgroundColor: label.trim() ? p.ink : p.muted }]}
        onPress={commit}
        disabled={!label.trim()}
      >
        <Text style={[styles.addBtnText, { color: p.isDark ? p.bg : '#fff' }]}>Add</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, marginBottom: 16 },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 10 },
  input: { borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, marginBottom: 10 },
  inputRow: { flexDirection: 'row', gap: 6, marginBottom: 10, alignItems: 'center' },
  inputSmall: { borderRadius: 8, padding: 8, fontSize: 13, minWidth: 0 },
  fieldHint: { fontSize: 11, marginTop: -4, marginBottom: 10, lineHeight: 15 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 11, marginBottom: 10 },
  dateText: { fontSize: 13, fontWeight: '500' },
  addBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  addBtnText: { fontSize: 15, fontWeight: '600' },
});
