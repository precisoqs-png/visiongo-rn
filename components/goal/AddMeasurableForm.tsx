import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { MeasurableType, Measurable, newMeasurable } from '../../store/models';
import { Palette, FONTS } from '../../theme/themes';

interface Props {
  palette: Palette;
  onAdd: (m: Measurable) => void;
}

// No "Weekly" (ladder) option here — a progressive weekly build-up is
// strictly better served by a Milestone's build-up Commitment, which gets
// its own reminder and shows up in the Tasks tab; a ladder Measurable gets
// neither. No template creates one anymore either (see goalTemplates.ts).
const TYPES: { key: MeasurableType; label: string; icon: string }[] = [
  { key: 'check', label: 'Checkbox', icon: '✓' },
  { key: 'number', label: 'Number', icon: '#' },
];

export function AddMeasurableForm({ palette: p, onAdd }: Props) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<MeasurableType>('check');
  const [targetStr, setTargetStr] = useState('');
  const [unit, setUnit] = useState('');
  const [stepStr, setStepStr] = useState('');

  const commit = () => {
    if (!label.trim()) return;
    const m: Measurable = newMeasurable({ type, label: label.trim() });
    if (type === 'number') {
      m.target = parseFloat(targetStr) || 1;
      m.unit = unit;
      // Blank or nonsense step falls back to 1 rather than a hardcoded jump.
      const parsedStep = parseFloat(stepStr);
      m.step = Number.isFinite(parsedStep) && parsedStep > 0 ? parsedStep : 1;
    }
    onAdd(m);
    setLabel(''); setTargetStr(''); setUnit('');
    setStepStr('');
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

      <Text style={[styles.fieldHint, { color: p.muted }]}>
        Want a progressive weekly build-up instead? Add a Milestone below and use its "Build up gradually" option.
      </Text>

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
