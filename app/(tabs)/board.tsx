import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/useThemeStore';
import { useAppStore } from '../../store/useAppStore';
import { RadialBoard } from '../../components/board/RadialBoard';
import { GridBoard } from '../../components/board/GridBoard';
import { MonthBoard } from '../../components/board/MonthBoard';
import { FONTS } from '../../theme/themes';

export default function BoardScreen() {
  const router = useRouter();
  const palette = useThemeStore((s) => s.palette);
  const cycleNext = useThemeStore((s) => s.cycleNext);
  const p = palette;

  const selectedYear = useAppStore((s) => s.selectedYear);
  const boardLayout = useAppStore((s) => s.boardLayout);
  const boardViewMode = useAppStore((s) => s.boardViewMode);
  const selectYear = useAppStore((s) => s.selectYear);
  const setBoardLayout = useAppStore((s) => s.setBoardLayout);
  const setBoardViewMode = useAppStore((s) => s.setBoardViewMode);
  const addGoal = useAppStore((s) => s.addGoal);
  const currentYearData = useAppStore((s) => s.currentYearData);

  const yd = currentYearData();

  const handleAddGoal = () => {
    const id = addGoal();
    router.push(`/goal/${id}`);
  };

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      {/*
        IMPORTANT: Do NOT wrap this in a TouchableOpacity with absoluteFill.
        On web, that swallows all pointer events and makes the FAB / goal
        bubbles / inputs unresponsive. Long-press for theme cycling is
        scoped to just the header row so it doesn't block anything else.
      */}
      <View style={styles.inner}>
        {/* Header — long-press here to cycle themes */}
        <Pressable onLongPress={cycleNext} delayLongPress={600}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.eyebrow, { color: p.muted }]}>VISION BOARD</Text>
              <Text style={[styles.motto, { color: p.text }]} numberOfLines={1}>
                {yd?.motto ?? 'Dream it. Plan it. Live it.'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.layoutBtn, { backgroundColor: p.surface }]}
              onPress={() => setBoardLayout(boardLayout === 'radial' ? 'grid' : 'radial')}
            >
              <Ionicons
                name={boardLayout === 'radial' ? 'grid-outline' : 'ellipse-outline'}
                size={16}
                color={p.text}
              />
            </TouchableOpacity>
          </View>
        </Pressable>

        <View style={styles.yearRow}>
          <TouchableOpacity onPress={() => selectYear(selectedYear - 1)}>
            <Ionicons name="chevron-back" size={16} color={p.muted} />
          </TouchableOpacity>
          <View style={styles.yearCenter}>
            <Text style={[styles.yearDiamond, { color: p.accent }]}>◈</Text>
            <Text style={[styles.yearNum, { color: p.text }]}>{selectedYear}</Text>
            <Text style={[styles.yearDiamond, { color: p.accent }]}>◈</Text>
          </View>
          <TouchableOpacity onPress={() => selectYear(selectedYear + 1)}>
            <Ionicons name="chevron-forward" size={16} color={p.muted} />
          </TouchableOpacity>
        </View>

        <View style={[styles.segmented, { backgroundColor: p.line }]}>
          {(['wholeYear', 'byMonth'] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[styles.segBtn, boardViewMode === mode && { backgroundColor: p.ink }]}
              onPress={() => setBoardViewMode(mode)}
            >
              <Text
                style={[
                  styles.segText,
                  { color: boardViewMode === mode ? (p.isDark ? p.bg : '#fff') : p.muted },
                ]}
              >
                {mode === 'wholeYear' ? 'Whole Year' : 'By Month'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {!yd ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: p.muted }]}>No goals yet. Tap + to add one!</Text>
          </View>
        ) : boardViewMode === 'wholeYear' ? (
          boardLayout === 'radial' ? (
            <RadialBoard
              yearData={yd}
              palette={p}
              onGoalPress={(id) => router.push(`/goal/${id}`)}
              onAddGoal={handleAddGoal}
              onCompletedPress={() => router.push('/completed')}
            />
          ) : (
            <GridBoard
              yearData={yd}
              palette={p}
              onGoalPress={(id) => router.push(`/goal/${id}`)}
              onAddGoal={handleAddGoal}
            />
          )
        ) : (
          <MonthBoard
            yearData={yd}
            palette={p}
            onGoalPress={(id) => router.push(`/goal/${id}`)}
          />
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  inner: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 8,
  },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 2 },
  motto: { fontSize: 15, fontStyle: 'italic', marginTop: 2 },
  layoutBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  yearRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 20, paddingVertical: 6,
  },
  yearCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  yearDiamond: { fontSize: 14 },
  yearNum: { fontSize: 18, fontWeight: '700', fontFamily: FONTS.display },
  segmented: {
    flexDirection: 'row', borderRadius: 20, padding: 3,
    marginHorizontal: 20, marginBottom: 6, gap: 2,
  },
  segBtn: { flex: 1, paddingVertical: 7, borderRadius: 16, alignItems: 'center' },
  segText: { fontSize: 13, fontWeight: '500' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 15 },
});
