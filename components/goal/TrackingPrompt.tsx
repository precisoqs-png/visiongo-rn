import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Measurable, newMeasurable, newCommitment } from '../../store/models';
import { parseTrackingInput, ParsedTracking } from '../../store/trackingParser';
import { AddMeasurableForm } from './AddMeasurableForm';
import { Palette } from '../../theme/themes';

interface Props {
  palette: Palette;
  goalTargetDate?: string;
  milestoneId: string;
  // The created item's label is always the milestone's own — see
  // AddMeasurableForm's matching comment for why.
  milestoneLabel: string;
  goalTitle: string;
  onAdd: (m: Measurable) => void;
  // Seeds the goal's existing coach sheet (same plumbing DecompCard already
  // uses) rather than building a second coach — this is a new entry point
  // into it, not a new coach.
  onAskCoach: (seed: string) => void;
}

const EXAMPLES = ['24 books', '£5,000', '3 runs a week'];

function describeParsed(parsed: ParsedTracking): string {
  if (parsed.kind === 'number') {
    return `Tracking ${formatTarget(parsed.target)}${parsed.unit ? ` ${parsed.unit}` : ''}, counting up one at a time.`;
  }
  if (parsed.kind === 'commitment') {
    if (parsed.cadence === 'monthly') return 'Tracking this as a monthly habit.';
    if (parsed.cadence === 'custom') {
      return parsed.intervalDays === 1
        ? 'Tracking this daily.'
        : `Tracking this every ${parsed.intervalDays ?? 7} days.`;
    }
    return 'Tracking this as a weekly habit.';
  }
  return 'Tracking this as a simple yes/done.';
}

function formatTarget(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function buildMeasurable(parsed: ParsedTracking, label: string, milestoneId: string): Measurable {
  if (parsed.kind === 'number') {
    return newMeasurable({
      type: 'number', label, parentId: milestoneId,
      target: parsed.target, unit: parsed.unit, step: parsed.step,
    });
  }
  if (parsed.kind === 'commitment') {
    return newMeasurable({
      type: 'commitment', label, parentId: milestoneId,
      commitments: [newCommitment({ label, cadence: parsed.cadence, intervalDays: parsed.intervalDays })],
    });
  }
  return newMeasurable({ type: 'check', label, parentId: milestoneId });
}

// The "what will you track" question rebuilt as one field instead of
// five — parsing rules live in store/trackingParser.ts. Three phases:
// type a sentence, review what was understood (with a correction path to
// the full manual controls), or hand the whole thing to the coach
// instead. Nothing is written to the goal until either the confirm
// step's own "Add" or the correction form's own "Add" is pressed —
// typing and even submitting for a parse never mutates anything.
export function TrackingPrompt({ palette: p, goalTargetDate, milestoneId, milestoneLabel, goalTitle, onAdd, onAskCoach }: Props) {
  const [text, setText] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [pending, setPending] = useState<ParsedTracking | null>(null);
  const [correcting, setCorrecting] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setPlaceholderIdx((i) => (i + 1) % EXAMPLES.length), 2600);
    return () => clearInterval(id);
  }, []);

  const submit = () => {
    if (!text.trim()) return;
    setPending(parseTrackingInput(text));
    setCorrecting(false);
  };

  const confirmAdd = () => {
    if (!pending) return;
    onAdd(buildMeasurable(pending, milestoneLabel, milestoneId));
    setText('');
    setPending(null);
  };

  const reset = () => {
    setText('');
    setPending(null);
    setCorrecting(false);
  };

  if (correcting) {
    // The pre-existing five-field controls, now the correction path
    // instead of the front door — prefilled from the parse, still fully
    // editable, nothing about that form's own logic changed.
    return (
      <AddMeasurableForm
        palette={p}
        goalTargetDate={goalTargetDate}
        milestoneId={milestoneId}
        milestoneLabel={milestoneLabel}
        initial={
          pending?.kind === 'number'
            ? { type: 'number', target: pending.target, unit: pending.unit, step: pending.step }
            : { type: 'check' }
        }
        onAdd={(m) => { onAdd(m); reset(); }}
      />
    );
  }

  if (pending) {
    return (
      <View style={[styles.card, { backgroundColor: `${p.surface}99` }]}>
        <Text
          style={[styles.confirmText, { color: p.text }]}
          accessibilityRole="text"
          accessibilityLabel={describeParsed(pending)}
        >
          {describeParsed(pending)}
        </Text>
        <View style={styles.confirmActions}>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: p.ink }]}
            onPress={confirmAdd}
            accessibilityRole="button"
            accessibilityLabel="Add this tracking"
          >
            <Text style={[styles.addBtnText, { color: p.isDark ? p.bg : '#fff' }]}>Add</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setCorrecting(true)}
            accessibilityRole="button"
            accessibilityLabel="Change this — open detailed tracking controls"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.changeText, { color: p.muted }]}>Change this</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: `${p.surface}99` }]}>
      <Text style={[styles.eyebrow, { color: p.muted }]}>WHAT ARE YOU AIMING FOR?</Text>
      <TextInput
        style={[styles.input, { backgroundColor: p.surface, color: p.text, borderColor: p.line }]}
        placeholder={EXAMPLES[placeholderIdx]}
        placeholderTextColor={p.muted}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        returnKeyType="done"
        accessibilityLabel="What are you aiming for?"
        accessibilityHint={`For example, ${EXAMPLES.join(', or ')}`}
      />
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.trackBtn, { backgroundColor: text.trim() ? p.ink : p.line }]}
          onPress={submit}
          disabled={!text.trim()}
          accessibilityRole="button"
          accessibilityLabel="Track it"
          accessibilityState={{ disabled: !text.trim() }}
        >
          <Text style={[styles.trackBtnText, { color: text.trim() ? (p.isDark ? p.bg : '#fff') : p.muted }]}>
            Track it
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.coachRow}
          onPress={() => onAskCoach(
            `Help me figure out how to track "${milestoneLabel}" for the goal "${goalTitle}".`,
          )}
          accessibilityRole="button"
          accessibilityLabel="Not sure? Ask the coach"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="sparkles-outline" size={13} color={p.accent} />
          <Text style={[styles.coachText, { color: p.accent }]}>Not sure? Ask the coach</Text>
        </TouchableOpacity>
      </View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  trackBtn: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  trackBtnText: { fontSize: 14, fontWeight: '700' },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  coachText: { fontSize: 13, fontWeight: '600' },
  confirmText: { fontSize: 15, lineHeight: 21, marginBottom: 12 },
  confirmActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  addBtn: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20 },
  addBtnText: { fontSize: 14, fontWeight: '700' },
  changeText: { fontSize: 13, fontWeight: '600' },
});
