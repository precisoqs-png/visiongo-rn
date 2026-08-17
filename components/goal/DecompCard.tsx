import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Goal } from '../../store/models';
import { Palette } from '../../theme/themes';

interface Props {
  goal: Goal;
  palette: Palette;
  onAskCoach: (seedMessage: string) => void;
}

// The empty-goal card that seeds the coach with a real "break this down"
// prompt — originally only on the Milestones screen, two taps deep from
// where a user actually lands after onboarding. Shared so the goal canvas
// (app/(tabs)/board/goal/[id]/index.tsx) can show the same card in place of its old
// plain-text empty hint, instead of drifting into its own copy.
export function DecompCard({ goal, palette: p, onAskCoach }: Props) {
  return (
    <View style={[styles.decompCard, { backgroundColor: p.surface }]}>
      <Ionicons name="sparkles" size={18} color={p.accent} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.decompTitle, { color: p.text }]}>Nothing here yet</Text>
        <Text style={[styles.decompBody, { color: p.muted }]}>
          Let the coach break "{goal.title}" into concrete steps and a recurring
          commitment — or add a milestone yourself. Measurables live on the
          goal's bubble canvas.
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.decompBtn, { backgroundColor: p.ink }]}
        onPress={() => onAskCoach(
          `This goal has nothing on it yet. Break "${goal.title}" down into a few ` +
          `concrete steps and, if it fits, a milestone with a recurring commitment.`,
        )}
      >
        <Text style={[styles.decompBtnText, { color: p.isDark ? p.bg : '#fff' }]}>Ask coach</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  decompCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, padding: 14,
  },
  decompTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  decompBody: { fontSize: 12, lineHeight: 17 },
  decompBtn: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
  decompBtnText: { fontSize: 13, fontWeight: '700' },
});
