import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Measurable, measurableFraction } from '../../store/models';
import { Palette, FONTS } from '../../theme/themes';

interface Props {
  measurable: Measurable;
  palette: Palette;
  onUpdate: (m: Measurable) => void;
  onDelete: (id: string) => void;
}

export function MeasurableCard({ measurable: m, palette, onUpdate, onDelete }: Props) {
  const p = palette;
  const frac = measurableFraction(m);

  return (
    <View style={[styles.card, { backgroundColor: p.surface }]}>
      {m.type === 'check' && <CheckRow m={m} p={p} onUpdate={onUpdate} onDelete={onDelete} />}
      {m.type === 'number' && <NumberRow m={m} p={p} onUpdate={onUpdate} onDelete={onDelete} frac={frac} />}
      {m.type === 'ladder' && <LadderRows m={m} p={p} onUpdate={onUpdate} onDelete={onDelete} frac={frac} />}
    </View>
  );
}

function CheckRow({ m, p, onUpdate, onDelete }: { m: Measurable; p: Palette; onUpdate: (m: Measurable) => void; onDelete: (id: string) => void }) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[
          styles.checkbox,
          { borderColor: m.done ? p.accent : p.line },
          m.done && { backgroundColor: p.accent },
        ]}
        onPress={() => onUpdate({ ...m, done: !m.done })}
      >
        {m.done && <Ionicons name="checkmark" size={13} color={p.surface} />}
      </TouchableOpacity>
      <Text
        style={[
          styles.checkLabel,
          { color: m.done ? p.muted : p.text },
          m.done && { textDecorationLine: 'line-through' },
        ]}
      >
        {m.label}
      </Text>
      <TouchableOpacity onPress={() => onDelete(m.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={14} color={p.muted} />
      </TouchableOpacity>
    </View>
  );
}

function NumberRow({ m, p, onUpdate, onDelete, frac }: { m: Measurable; p: Palette; onUpdate: (m: Measurable) => void; onDelete: (id: string) => void; frac: number }) {
  const stepSize = m.target >= 500 ? 100 : m.target >= 50 ? 5 : 1;
  const fmt = (v: number) => v % 1 === 0 ? String(Math.round(v)) : v.toFixed(1);

  return (
    <View>
      <View style={[styles.row, { marginBottom: 10 }]}>
        <Text style={[styles.numLabel, { color: p.text }]}>{m.label}</Text>
        <TouchableOpacity onPress={() => onDelete(m.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={14} color={p.muted} />
        </TouchableOpacity>
      </View>
      <View style={[styles.row, { marginBottom: 10 }]}>
        <TouchableOpacity
          style={[styles.stepper, { backgroundColor: p.line }]}
          onPress={() => onUpdate({ ...m, current: Math.max(0, m.current - stepSize) })}
        >
          <Ionicons name="remove" size={16} color={p.text} />
        </TouchableOpacity>
        <Text style={[styles.stepperVal, { color: p.text }]}>
          {fmt(m.current)} / {fmt(m.target)} {m.unit}
        </Text>
        <TouchableOpacity
          style={[styles.stepper, { backgroundColor: p.line }]}
          onPress={() => onUpdate({ ...m, current: Math.min(m.target, m.current + stepSize) })}
        >
          <Ionicons name="add" size={16} color={p.text} />
        </TouchableOpacity>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: p.line }]}>
        <View style={[styles.progressFill, { backgroundColor: p.accent, width: `${frac * 100}%` }]} />
      </View>
    </View>
  );
}

function LadderRows({ m, p, onUpdate, onDelete, frac }: { m: Measurable; p: Palette; onUpdate: (m: Measurable) => void; onDelete: (id: string) => void; frac: number }) {
  const fmt = (v: number) => v % 1 === 0 ? String(Math.round(v)) : v.toFixed(1);
  const pct = Math.round(frac * 100);

  return (
    <View>
      <View style={[styles.row, { marginBottom: 8 }]}>
        <Text style={[styles.numLabel, { color: p.text }]}>{m.label}</Text>
        <Text style={[styles.ladderPct, { color: p.accent }]}>{pct}%</Text>
        <TouchableOpacity onPress={() => onDelete(m.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8 }}>
          <Ionicons name="close" size={14} color={p.muted} />
        </TouchableOpacity>
      </View>
      {m.weeks.map((week, idx) => {
        const due = new Date(week.targetDate);
        const dueStr = due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        return (
          <View key={week.id} style={[styles.row, { marginBottom: 6 }]}>
            <TouchableOpacity
              style={[
                styles.ladderBox,
                { borderColor: week.done ? p.accent : p.line },
                week.done && { backgroundColor: p.accent },
              ]}
              onPress={() => {
                const weeks = m.weeks.map((w) => w.id === week.id ? { ...w, done: !w.done } : w);
                onUpdate({ ...m, weeks });
              }}
            >
              {week.done && <Ionicons name="checkmark" size={10} color={p.surface} />}
            </TouchableOpacity>
            <Text style={[styles.ladderVal, { color: week.done ? p.muted : p.text }]}>
              {fmt(week.value)} {m.unit}
            </Text>
            <Text style={[styles.ladderDue, { color: p.muted }]}>by {dueStr}</Text>
            <Text style={[styles.ladderStep, { color: p.muted }]}>Step {idx + 1}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkLabel: { flex: 1, fontSize: 15 },
  numLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  stepper: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepperVal: { fontSize: 15, fontWeight: '700' },
  progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3 },
  ladderPct: { fontSize: 13, fontWeight: '700' },
  ladderBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ladderVal: { fontSize: 13, fontWeight: '500', flex: 1 },
  ladderDue: { fontSize: 12 },
  ladderStep: { fontSize: 11 },
});
