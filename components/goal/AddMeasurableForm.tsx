import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { MeasurableType, Measurable, newMeasurable, buildLadderWeeks } from '../../store/models';
import { Palette, FONTS } from '../../theme/themes';

interface Props {
  palette: Palette;
  onAdd: (m: Measurable) => void;
  // Paces a new build-up's weekly dates the same way the coach does
  // (buildLadderWeeks anchors the LAST week to this date, walking the rest
  // back from it) — omitted falls back to "starting today".
  goalTargetDate?: string;
}

// "Build-up" (type 'ladder' under the hood) mirrors exactly what the coach
// already builds for a "weekly long-run build-up" style measurable — this
// used to only be reachable by asking the coach or going through a
// Milestone's "Build up gradually" Commitment; this is the same shape
// (Measurable.weeks, applyCoachAction's 'addTask'/type 'ladder' case in
// useAppStore.ts) as a direct, no-Milestone-needed manual path.
const TYPES: { key: MeasurableType; label: string; icon: string }[] = [
  { key: 'check', label: 'Checkbox', icon: '✓' },
  { key: 'number', label: 'Number', icon: '#' },
  { key: 'ladder', label: 'Build-up', icon: '↗' },
];

export function AddMeasurableForm({ palette: p, onAdd, goalTargetDate }: Props) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<MeasurableType>('check');
  const [targetStr, setTargetStr] = useState('');
  const [unit, setUnit] = useState('');
  const [stepStr, setStepStr] = useState('');
  // Build-up-only fields — same three things the coach asks for in chat:
  // current baseline, step size, and how many weeks to build over.
  const [startStr, setStartStr] = useState('');
  const [weeksStr, setWeeksStr] = useState('8');

  const commit = () => {
    if (!label.trim()) return;
    const m: Measurable = newMeasurable({ type, label: label.trim() });
    if (type === 'number') {
      m.target = parseFloat(targetStr) || 1;
      m.unit = unit;
      // Blank or nonsense step falls back to 1 rather than a hardcoded jump.
      const parsedStep = parseFloat(stepStr);
      m.step = Number.isFinite(parsedStep) && parsedStep > 0 ? parsedStep : 1;
    } else if (type === 'ladder') {
      const start = parseFloat(startStr) || 0;
      const parsedStep = parseFloat(stepStr);
      const increment = Number.isFinite(parsedStep) && parsedStep > 0 ? parsedStep : 1;
      const weeks = Math.max(1, parseInt(weeksStr, 10) || 1);
      const end = start + increment * weeks;
      m.unit = unit;
      m.target = end;
      m.step = increment;
      m.weeks = buildLadderWeeks(start, end, weeks, goalTargetDate);
      m.sizedForGoalDate = goalTargetDate;
    }
    onAdd(m);
    setLabel(''); setTargetStr(''); setUnit('');
    setStepStr(''); setStartStr(''); setWeeksStr('8');
  };

  return (
    <View style={[styles.card, { backgroundColor: `${p.surface}99` }]}>
      <Text style={[styles.eyebrow, { color: p.muted }]}>ADD YOUR OWN</Text>

      <TextInput
        style={[styles.input, { backgroundColor: p.surface, color: p.text, borderColor: p.line }]}
        placeholder="What will you measure?"
        placeholderTextColor={p.muted}
        value={label}
        onChangeText={setLabel}
      />

      {/* Type picker */}
      <View style={[styles.typePicker, { backgroundColor: p.line }]}>
        {TYPES.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.typeBtn, type === t.key && { backgroundColor: p.ink }]}
            onPress={() => setType(t.key)}
          >
            <Text style={[styles.typeBtnText, { color: type === t.key ? (p.isDark ? p.bg : '#fff') : p.muted }]}>
              {t.icon} {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Type-specific inputs */}
      {type === 'number' && (
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
              style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1.6 }]}
              placeholder="Unit (e.g. mi)"
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
            Step is how much one tap of +/- adds — defaults to 1
            {unit.trim() ? ` ${unit.trim()}` : ''}.
          </Text>
        </>
      )}

      {type === 'ladder' && (
        <>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1 }]}
              placeholder="Start"
              placeholderTextColor={p.muted}
              keyboardType="numeric"
              value={startStr}
              onChangeText={setStartStr}
            />
            <TextInput
              style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1 }]}
              placeholder="+ per week"
              placeholderTextColor={p.muted}
              keyboardType="numeric"
              value={stepStr}
              onChangeText={setStepStr}
            />
            <TextInput
              style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1 }]}
              placeholder="Weeks"
              placeholderTextColor={p.muted}
              keyboardType="numeric"
              value={weeksStr}
              onChangeText={setWeeksStr}
            />
            <TextInput
              style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1.2 }]}
              placeholder="Unit (e.g. km)"
              placeholderTextColor={p.muted}
              value={unit}
              onChangeText={setUnit}
            />
          </View>
          <Text style={[styles.fieldHint, { color: p.muted }]}>
            Builds {Math.max(1, parseInt(weeksStr, 10) || 1)} weekly steps from{' '}
            {(parseFloat(startStr) || 0) + (Number.isFinite(parseFloat(stepStr)) && parseFloat(stepStr) > 0 ? parseFloat(stepStr) : 1)}{' '}
            up to {(parseFloat(startStr) || 0) + (Number.isFinite(parseFloat(stepStr)) && parseFloat(stepStr) > 0 ? parseFloat(stepStr) : 1) * Math.max(1, parseInt(weeksStr, 10) || 1)}
            {unit.trim() ? ` ${unit.trim()}` : ''}, same as the AI coach builds one.
          </Text>
        </>
      )}

      {type !== 'ladder' && (
        <Text style={[styles.fieldHint, { color: p.muted }]}>
          Want a progressive weekly build-up? Pick "Build-up" above.
        </Text>
      )}

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
  input: {
    borderRadius: 10, padding: 12, fontSize: 15,
    borderWidth: 1, marginBottom: 10,
  },
  typePicker: { flexDirection: 'row', borderRadius: 20, padding: 3, marginBottom: 10, gap: 2 },
  typeBtn: { flex: 1, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 16, alignItems: 'center' },
  typeBtnText: { fontSize: 12, fontWeight: '500' },
  inputRow: { flexDirection: 'row', gap: 6, marginBottom: 10, alignItems: 'center' },
  // minWidth 0 lets these flex children shrink below their placeholder width —
  // without it the last field in the row is pushed off-screen on web.
  inputSmall: { borderRadius: 8, padding: 8, fontSize: 13, minWidth: 0 },
  fieldHint: { fontSize: 11, marginTop: -4, marginBottom: 10 },
  addBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  addBtnText: { fontSize: 15, fontWeight: '600' },
});
