import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TrackableItem, newMeasurable } from '../../store/models';
import { Palette } from '../../theme/themes';
import { CalendarPicker } from '../shared/CalendarPicker';

interface Props {
  palette: Palette;
  goalTargetDate?: string;
  onAdd: (m: TrackableItem) => void;
}

// Manual "add a milestone" form — same idea as AddMeasurableForm's manual
// path, but producing a milestone-flagged item (own deadline, no upfront
// numeric/effort split: a filled-in Target means 'number', blank means
// 'commitment' driven entirely by whatever Commitments get attached after).
export function AddMilestoneItemForm({ palette: p, goalTargetDate, onAdd }: Props) {
  const [label, setLabel] = useState('');
  const [targetStr, setTargetStr] = useState('');
  const [unit, setUnit] = useState('');
  const [stepStr, setStepStr] = useState('');
  const [deadline, setDeadline] = useState<string | undefined>(goalTargetDate);
  const [showPicker, setShowPicker] = useState(false);

  const hasTarget = targetStr.trim().length > 0;

  const commit = () => {
    const t = label.trim();
    if (!t) return;
    const parsedStep = parseFloat(stepStr);
    const m = newMeasurable({
      type: hasTarget ? 'number' : 'commitment',
      label: t,
      milestone: true,
      target: hasTarget ? (parseFloat(targetStr) || 1) : 0,
      unit: hasTarget ? unit : '',
      step: hasTarget && Number.isFinite(parsedStep) && parsedStep > 0 ? parsedStep : 1,
      deadline,
      // Only tracked as "borrowed" from the goal while it still matches —
      // see isItemDeadlineOutdated in models.ts.
      sizedForGoalDate: deadline === goalTargetDate ? goalTargetDate : undefined,
    });
    onAdd(m);
    setLabel(''); setTargetStr(''); setUnit(''); setStepStr('');
  };

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

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1 }]}
          placeholder="Target (optional)"
          placeholderTextColor={p.muted}
          keyboardType="numeric"
          value={targetStr}
          onChangeText={setTargetStr}
        />
        <TextInput
          style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1.4 }]}
          placeholder="Unit ($, km)"
          placeholderTextColor={p.muted}
          value={unit}
          onChangeText={setUnit}
          editable={hasTarget}
        />
        <TextInput
          style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1 }]}
          placeholder="Step"
          placeholderTextColor={p.muted}
          keyboardType="numeric"
          value={stepStr}
          onChangeText={setStepStr}
          editable={hasTarget}
        />
      </View>
      <Text style={[styles.fieldHint, { color: p.muted }]}>
        {hasTarget
          ? 'A number to hit, with a deadline below — attach a recurring commitment after adding it.'
          : 'No number to hit? Leave Target blank and attach a recurring commitment after adding it.'}
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

      <CalendarPicker
        visible={showPicker}
        value={deadline}
        palette={p}
        onSelect={(iso) => { setDeadline(iso); setShowPicker(false); }}
        onClear={() => { setDeadline(undefined); setShowPicker(false); }}
        onDismiss={() => setShowPicker(false)}
      />
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
