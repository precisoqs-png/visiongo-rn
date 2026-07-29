import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BreakdownOption, MinorGoal, suggestBreakdowns, formatAmount } from '../../store/models';
import { Palette } from '../../theme/themes';

interface Props {
  visible: boolean;
  minorGoal: MinorGoal | null;
  palette: Palette;
  onPick: (option: BreakdownOption) => void;
  onSkip: () => void;
}

/**
 * Case 1: a numeric minor goal with a target and a deadline. The app does the
 * arithmetic itself and offers weekly or monthly commitments — no AI needed.
 * Nothing is created unless the user picks one.
 */
export function BreakdownPrompt({ visible, minorGoal, palette: p, onPick, onSkip }: Props) {
  const options = minorGoal ? suggestBreakdowns(minorGoal) : [];
  if (!minorGoal || options.length === 0) return null;

  const remaining = Math.max(0, (minorGoal.target ?? 0) - (minorGoal.current ?? 0));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: p.bg }]}>
          <View style={styles.header}>
            <Ionicons name="calculator-outline" size={18} color={p.accent} />
            <Text style={[styles.title, { color: p.text }]}>Break this down?</Text>
          </View>

          <Text style={[styles.body, { color: p.muted }]}>
            "{minorGoal.title}" needs {formatAmount(remaining, minorGoal.unit)} by{' '}
            {new Date(minorGoal.deadline as string).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
            })}
            . Want it as a recurring commitment you can be reminded about?
          </Text>

          {options.map((o) => (
            <TouchableOpacity
              key={o.cadence}
              style={[styles.option, { borderColor: `${p.accent}66`, backgroundColor: p.surface }]}
              onPress={() => onPick(o)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionLabel, { color: p.text }]}>{o.label}</Text>
                <Text style={[styles.optionMeta, { color: p.muted }]}>{o.summary}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={p.accent} />
            </TouchableOpacity>
          ))}

          <TouchableOpacity onPress={onSkip} style={styles.skipBtn}>
            <Text style={[styles.skipText, { color: p.muted }]}>
              Not now — I'll add steps myself
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: '#00000070',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  sheet: { width: '100%', maxWidth: 440, borderRadius: 20, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 8,
  },
  optionLabel: { fontSize: 15, fontWeight: '700' },
  optionMeta: { fontSize: 12, marginTop: 2 },
  skipBtn: { paddingVertical: 10, alignItems: 'center' },
  skipText: { fontSize: 13, fontWeight: '500' },
});
