import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Pressable, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/useThemeStore';
import { useAppStore } from '../../store/useAppStore';
import { BoardPosition } from '../../store/models';
import { cancelEverythingForGoal } from '../../services/notificationService';
import { RadialBoard } from '../../components/board/RadialBoard';
import { GridBoard } from '../../components/board/GridBoard';
import { MonthBoard } from '../../components/board/MonthBoard';
import { TemplatePicker } from '../../components/board/TemplatePicker';
import { GoalActionSheet } from '../../components/board/GoalActionSheet';
import { SegmentedControl } from '../../components/shared/SegmentedControl';
import { BackupPrompt } from '../../components/BackupPrompt';
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
  const realignBoard = useAppStore((s) => s.realignBoard);

  const yd = useAppStore((s) => s.years.find((y) => y.year === s.selectedYear));

  const [pickerVisible, setPickerVisible] = useState(false);
  const [actionGoal, setActionGoal] = useState<{ id: string; title: string } | null>(null);

  const isEmpty = !yd || yd.goals.length === 0;

  const handleGoalLongPress = (id: string, title: string) => {
    setActionGoal({ id, title });
  };

  // Persist a bubble's dragged position (normalized to board size)
  const handleGoalMove = (id: string, pos: BoardPosition) => {
    const goal = useAppStore.getState().getGoal(id);
    if (goal) useAppStore.getState().updateGoal({ ...goal, boardPosition: pos });
  };

  // Bubble dropped on the trash zone — confirm, then delete
  const handleGoalDelete = (id: string, title: string) => {
    const doDelete = () => {
      void cancelEverythingForGoal(id);
      useAppStore.getState().deleteGoal(id);
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${title}"? This cannot be undone.`)) doDelete();
    } else {
      Alert.alert(
        'Delete Goal',
        `Delete "${title}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ],
      );
    }
  };

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      <View style={styles.inner}>
        {/* Header */}
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
          <TouchableOpacity
            onPress={() => selectYear(selectedYear - 1)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={22} color={p.muted} />
          </TouchableOpacity>
          <View style={styles.yearCenter}>
            <Text style={[styles.yearDiamond, { color: p.accent }]}>◈</Text>
            <Text style={[styles.yearNum, { color: p.text }]}>{selectedYear}</Text>
            <Text style={[styles.yearDiamond, { color: p.accent }]}>◈</Text>
          </View>
          <TouchableOpacity
            onPress={() => selectYear(selectedYear + 1)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-forward" size={22} color={p.muted} />
          </TouchableOpacity>
        </View>

        {!isEmpty && (
          <View style={styles.segmentedWrap}>
            <SegmentedControl
              segments={[
                { key: 'wholeYear', label: 'Whole Year' },
                { key: 'byMonth', label: 'By Month' },
              ]}
              value={boardViewMode}
              onChange={setBoardViewMode}
              palette={p}
            />
          </View>
        )}

        {isEmpty ? (
          <EmptyState year={selectedYear} p={p} onAdd={() => setPickerVisible(true)} />
        ) : boardViewMode === 'wholeYear' ? (
          boardLayout === 'radial' ? (
            <RadialBoard
              yearData={yd}
              palette={p}
              onGoalPress={(id) => router.push(`/goal/${id}`)}
              onGoalMove={handleGoalMove}
              onGoalDelete={handleGoalDelete}
              onAddGoal={() => setPickerVisible(true)}
              onCompletedPress={() => router.push('/completed')}
              onRealign={realignBoard}
            />
          ) : (
            <GridBoard
              yearData={yd}
              palette={p}
              onGoalPress={(id) => router.push(`/goal/${id}`)}
              onGoalLongPress={handleGoalLongPress}
              onAddGoal={() => setPickerVisible(true)}
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

      <TemplatePicker
        visible={pickerVisible}
        onDismiss={() => setPickerVisible(false)}
        palette={p}
      />

      <GoalActionSheet
        goalId={actionGoal?.id ?? null}
        goalTitle={actionGoal?.title ?? ''}
        visible={!!actionGoal}
        onDismiss={() => setActionGoal(null)}
        palette={p}
      />

      <BackupPrompt />
    </LinearGradient>
  );
}

function EmptyState({ year, p, onAdd }: { year: number; p: any; onAdd: () => void }) {
  const RING = 200;
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.ringWrap}>
        <View
          style={[
            styles.dashedRing,
            { width: RING, height: RING, borderRadius: RING / 2, borderColor: p.accent },
          ]}
        >
          <Text style={[styles.ringYear, { color: p.accent, fontFamily: FONTS.display }]}>
            {year}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.badgePlus, { backgroundColor: p.accent }]}
          onPress={onAdd}
        >
          <Ionicons name="add" size={18} color={p.isDark ? p.bg : '#fff'} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.emptyTitle, { color: p.text }]}>Your board is a blank canvas</Text>
      <Text style={[styles.emptyBody, { color: p.muted }]}>
        Add your first goal and start turning your vision into reality.
      </Text>

      <TouchableOpacity
        style={[styles.addFirstBtn, { backgroundColor: p.ink }]}
        onPress={onAdd}
      >
        <Ionicons name="add" size={18} color={p.isDark ? p.bg : '#fff'} />
        <Text style={[styles.addFirstText, { color: p.isDark ? p.bg : '#fff' }]}>
          Add your first goal
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  inner: { flex: 1, overflow: 'hidden' },
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
  yearNum: { fontSize: 22, fontWeight: '700', fontFamily: FONTS.display },
  segmentedWrap: { marginHorizontal: 20, marginBottom: 6 },
  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16,
  },
  ringWrap: { position: 'relative', marginBottom: 8 },
  dashedRing: {
    borderWidth: 2, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  ringYear: { fontSize: 42, fontWeight: '700' },
  badgePlus: {
    position: 'absolute', right: -4, top: -4,
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  addFirstBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 28, marginTop: 8,
  },
  addFirstText: { fontSize: 16, fontWeight: '600' },
});
