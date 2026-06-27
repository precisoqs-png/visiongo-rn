import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { MeasurableType, Measurable, newId, buildLadderWeeks, Goal } from '../../store/models';
import { Palette, FONTS } from '../../theme/themes';

interface Props {
  goal: Goal;
  palette: Palette;
  onAdd: (m: Measurable) => void;
}

const TYPES: { key: MeasurableType; label: string; icon: string }[] = [
  { key: 'check', label: 'Checkbox', icon: '✓' },
  { key: 'number', label: 'Number', icon: '#' },
  { key: 'ladder', label: 'Weekly', icon: '↗' },
];

export function AddMeasurableForm({ goal, palette: p, onAdd }: Props) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<MeasurableType>('check');
  const [targetStr, setTargetStr] = useState('');
  const [unit, setUnit] = useState('');
  const [startStr, setStartStr] = useState('');
  const [weeksStr, setWeeksStr] = useState('');

  const commit = () => {
    if (!label.trim()) return;
    const m: Measurable = {
      id: newId(), type, label: label.trim(),
      done: false, current: 0, target: 0, unit: '', weeks: [],
    };
    if (type === 'number') {
      m.target = parseFloat(targetStr) || 1;
      m.unit = unit;
    } else if (type === 'ladder') {
      const start = parseFloat(startStr) || 0;
      const end = parseFloat(targetStr) || 1;
      const count = parseInt(weeksStr) || 4;
      m.target = end; m.unit = unit;
      m.weeks = buildLadderWeeks(start, end, count, goal.targetDate);
    }
    onAdd(m);
    setLabel(''); setTargetStr(''); setUnit(''); setStartStr(''); setWeeksStr('');
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
            style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 2 }]}
            placeholder="Unit (e.g. miles)"
            placeholderTextColor={p.muted}
            value={unit}
            onChangeText={setUnit}
          />
        </View>
      )}

      {type === 'ladder' && (
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1 }]}
            placeholder="Start"
            placeholderTextColor={p.muted}
            keyboardType="numeric"
            value={startStr}
            onChangeText={setStartStr}
          />
          <Text style={{ color: p.muted }}>→</Text>
          <TextInput
            style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1 }]}
            placeholder="Goal"
            placeholderTextColor={p.muted}
            keyboardType="numeric"
            value={targetStr}
            onChangeText={setTargetStr}
          />
          <TextInput
            style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1 }]}
            placeholder="Unit"
            placeholderTextColor={p.muted}
            value={unit}
            onChangeText={setUnit}
          />
          <TextInput
            style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1 }]}
            placeholder="Weeks"
            placeholderTextColor={p.muted}
            keyboardType="numeric"
            value={weeksStr}
            onChangeText={setWeeksStr}
          />
        </View>
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
  inputSmall: { borderRadius: 8, padding: 8, fontSize: 13 },
  addBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  addBtnText: { fontSize: 15, fontWeight: '600' },
});
