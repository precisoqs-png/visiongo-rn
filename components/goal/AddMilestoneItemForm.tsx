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

// Manual "add a milestone" form. The default/primary path is "name your
// win": a title and an optional target date, producing a milestone-flagged
// item with no current/target of its own (type 'commitment', no
// commitments attached yet — a plain reached/not-reached checkpoint until
// the user attaches a recurring commitment afterward). A numeric milestone
// (own target/unit/step, the old always-shown fields) is still available,
// but only via the "Add a number target" expansion — never the default.
export function AddMilestoneItemForm({ palette: p, goalTargetDate, onAdd }: Props) {
  const [label, setLabel] = useState('');
  const [deadline, setDeadline] = useState<string | undefined>(goalTargetDate);
  const [showPicker, setShowPicker] = useState(false);

  const [numericOpen, setNumericOpen] = useState(false);
  const [targetStr, setTargetStr] = useState('');
  const [unit, setUnit] = useState('');
  const [stepStr, setStepStr] = useState('');

  const hasTarget = numericOpen && targetStr.trim().length > 0;

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
    setLabel(''); setTargetStr(''); setUnit(''); setStepStr(''); setNumericOpen(false);
  };

  return (
    <View style={[styles.card, { backgroundColor: `${p.surface}99` }]}>
      <Text style={[styles.eyebrow, { color: p.muted }]}>ADD YOUR OWN</Text>

      <TextInput
        style={[styles.input, { backgroundColor: p.surface, color: p.text, borderColor: p.line }]}
        placeholder="Name your win — e.g. Run a marathon"
        placeholderTextColor={p.muted}
        value={label}
        onChangeText={setLabel}
      />

      <TouchableOpacity style={[styles.dateRow, { borderColor: p.line }]} onPress={() => setShowPicker(true)}>
        <Ionicons name="calendar-outline" size={14} color={p.muted} />
        <Text style={[styles.dateText, { color: deadline ? p.text : p.muted }]}>
          {deadline
            ? new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Target date (optional)'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.numericToggle}
        onPress={() => setNumericOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <Ionicons name={numericOpen ? 'chevron-down' : 'chevron-forward'} size={12} color={p.muted} />
        <Text style={[styles.numericToggleText, { color: p.muted }]}>
          Add a number target (optional)
        </Text>
      </TouchableOpacity>

      {numericOpen && (
        <>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1 }]}
              placeholder="Target"
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
            />
            <TextInput
              style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1 }]}
              placeholder="Step"
              placeholderTextColor={p.muted}
              keyboardType="numeric"
              value={stepStr}
              onChangeText={setStepStr}
            />
          </View>
          <Text style={[styles.fieldHint, { color: p.muted }]}>
            A number to hit instead of a plain reached/not-reached toggle.
          </Text>
        </>
      )}
      {!numericOpen && (
        <Text style={[styles.fieldHint, { color: p.muted }]}>
          A simple reached/not-reached checkpoint — attach a recurring commitment after adding it.
        </Text>
      )}

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
  numericToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  numericToggleText: { fontSize: 12, fontWeight: '600' },
  addBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  addBtnText: { fontSize: 15, fontWeight: '600' },
});
