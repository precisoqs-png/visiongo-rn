import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet,
  ActivityIndicator, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/useThemeStore';
import { useAppStore } from '../../store/useAppStore';
import { GOAL_NOTE_COLORS, FONTS } from '../../theme/themes';
import { coachService, CoachGoalContext } from '../../services/coachService';

export default function PairScreen() {
  const palette = useThemeStore((s) => s.palette);
  const p = palette;
  const goals = useAppStore((s) => s.currentYearData())?.goals ?? [];

  const [firstId, setFirstId] = useState<string | null>(null);
  const [secondId, setSecondId] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickerFor, setPickerFor] = useState<'first' | 'second' | null>(null);

  const canPair = firstId && secondId && firstId !== secondId;
  const g1 = goals.find((g) => g.id === firstId);
  const g2 = goals.find((g) => g.id === secondId);

  const runPairing = async () => {
    if (!g1 || !g2) return;
    setResult(null);
    setLoading(true);
    const prompt = `Two of my goals this year are:\n1. ${g1.title}\n2. ${g2.title}\n\nIn 2-3 encouraging sentences, describe how these two goals reinforce each other and help me become a better version of myself. If there's any potential tension between them, frame it as an exciting balance to manage — never discourage either goal.`;
    try {
      const ctx: CoachGoalContext = { goalTitle: `${g1.title} + ${g2.title}`, today: new Date() };
      const res = await coachService.send([{ role: 'user', text: prompt }], ctx);
      setResult(res.text);
    } catch {
      setResult('Unable to get a reading right now. Try again!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: p.muted }]}>PAIR</Text>
          <Text style={[styles.subtitle, { color: p.text }]}>See how two goals align</Text>
        </View>

        <View style={[styles.card, { backgroundColor: p.surface }]}>
          <GoalDropdown label="First goal" selected={g1 ?? null} palette={p} onPress={() => setPickerFor('first')} />
          <Text style={[styles.pairedWith, { color: p.muted }]}>paired with</Text>
          <GoalDropdown label="Second goal" selected={g2 ?? null} palette={p} onPress={() => setPickerFor('second')} />
        </View>

        <TouchableOpacity
          style={[styles.alignBtn, { backgroundColor: canPair ? p.ink : p.muted }]}
          onPress={runPairing}
          disabled={!canPair || loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color={p.isDark ? p.bg : '#fff'} />
          ) : (
            <Text style={[styles.alignText, { color: p.isDark ? p.bg : '#fff' }]}>See how they align</Text>
          )}
        </TouchableOpacity>

        {result && (
          <View style={[styles.resultCard, { backgroundColor: p.surface }]}>
            <View style={styles.resultHeader}>
              <Ionicons name="sparkles" size={16} color={p.accent} />
              <Text style={[styles.resultTitle, { color: p.text }]}>How they align</Text>
            </View>
            <Text style={[styles.resultText, { color: p.text }]}>{result}</Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={pickerFor !== null} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPickerFor(null)}>
          <View style={[styles.modalSheet, { backgroundColor: p.surface }]}>
            <Text style={[styles.modalTitle, { color: p.text }]}>Choose a goal</Text>
            {goals.map((goal) => (
              <TouchableOpacity
                key={goal.id}
                style={styles.goalPickerRow}
                onPress={() => {
                  if (pickerFor === 'first') setFirstId(goal.id);
                  else setSecondId(goal.id);
                  setPickerFor(null);
                  setResult(null);
                }}
              >
                <View style={[styles.goalDot, { backgroundColor: GOAL_NOTE_COLORS[goal.colorIndex % GOAL_NOTE_COLORS.length] }]} />
                <Text style={[styles.goalPickerText, { color: p.text }]}>{goal.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </LinearGradient>
  );
}

function GoalDropdown({ label, selected, palette: p, onPress }: any) {
  const noteColor = selected ? GOAL_NOTE_COLORS[selected.colorIndex % GOAL_NOTE_COLORS.length] : null;
  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={[{ fontSize: 11, fontWeight: '600', letterSpacing: 1, color: p.muted, marginBottom: 6 }]}>{label}</Text>
      <TouchableOpacity style={[styles.dropdown, { backgroundColor: p.bg ?? p.bgGradient?.[0] }]} onPress={onPress} activeOpacity={0.8}>
        {selected ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <View style={[styles.goalDot, { backgroundColor: noteColor }]} />
            <Text style={[{ fontSize: 15, flex: 1, color: p.text }]} numberOfLines={1}>{selected.title}</Text>
          </View>
        ) : (
          <Text style={[{ fontSize: 15, flex: 1, color: p.muted }]}>Choose a goal</Text>
        )}
        <Ionicons name="chevron-down" size={14} color={p.muted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 2 },
  subtitle: { fontSize: 20, fontStyle: 'italic', marginTop: 2 },
  card: { borderRadius: 16, padding: 18, marginHorizontal: 18, marginBottom: 14 },
  pairedWith: { fontSize: 16, fontStyle: 'italic', textAlign: 'center', marginVertical: 8 },
  dropdown: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, gap: 8 },
  alignBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginHorizontal: 18, marginBottom: 14 },
  alignText: { fontSize: 16, fontWeight: '600' },
  resultCard: { borderRadius: 14, padding: 16, marginHorizontal: 18 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  resultTitle: { fontSize: 14, fontWeight: '600' },
  resultText: { fontSize: 15, lineHeight: 22 },
  goalDot: { width: 10, height: 10, borderRadius: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, gap: 4 },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  goalPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  goalPickerText: { fontSize: 16 },
});
