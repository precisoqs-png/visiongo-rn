import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../../store/useThemeStore';
import { useAppStore, TaskItem, TaskGroup, TASK_GROUP_ORDER } from '../../store/useAppStore';
import { GOAL_NOTE_COLORS, FONTS } from '../../theme/themes';
import {
  cancelWeeklyTargetNotification, syncCommitmentNotifications,
} from '../../services/notificationService';

export default function TasksScreen() {
  const palette = useThemeStore((s) => s.palette);
  const p = palette;
  const completeTaskItem = useAppStore((s) => s.completeTaskItem);

  // Subscribe to underlying data so Zustand re-renders when it changes,
  // then memoize so allTasks() isn't called every render (infinite loop fix).
  const years = useAppStore((s) => s.years);
  const selectedYear = useAppStore((s) => s.selectedYear);
  const groups = useMemo(
    () => useAppStore.getState().allTasks(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [years, selectedYear],
  );

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      <View style={styles.header}>
        <Text style={[styles.eyebrow, { color: p.muted }]}>TASKS</Text>
        <Text style={[styles.subtitle, { color: p.text }]}>Everything due</Text>
      </View>

      {groups.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={48} color={`${p.muted}66`} />
          <Text style={[styles.emptyTitle, { color: p.muted }]}>All clear!</Text>
          <Text style={[styles.emptyBody, { color: p.muted }]}>
            No tasks yet. Add measurables or Commitments to your goals to see
            them here.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          {groups.map(({ key, items }) => {
            const openCount = items.filter((i) => !i.done).length;
            return (
              <React.Fragment key={key}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: key === 'Overdue' ? '#c0392b' : p.muted }]}>
                    {key.toUpperCase()}
                  </Text>
                  {openCount > 0 && (
                    <View style={[styles.badge, { backgroundColor: key === 'Overdue' ? '#c0392b' : p.muted }]}>
                      <Text style={styles.badgeText}>{openCount}</Text>
                    </View>
                  )}
                  <View style={[styles.rule, { backgroundColor: p.line }]} />
                </View>
                {items.map((item) => (
                  item.numberTask ? (
                    <NumberTaskRow
                      key={item.id}
                      item={item}
                      palette={p}
                      onIncrement={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        completeTaskItem(item);
                      }}
                    />
                  ) : (
                    <TaskRow
                      key={item.id}
                      item={item}
                      palette={p}
                      onComplete={() => {
                        completeTaskItem(item);
                        if (item.ladderWeekId) {
                          void cancelWeeklyTargetNotification(item.goalId, item.ladderWeekId);
                        } else if (item.stepId && useAppStore.getState().notificationsMasterOn) {
                          // A step just checked off from here must not still
                          // ping a reminder for the period/week it belonged to.
                          const fresh = useAppStore.getState().getGoal(item.goalId);
                          if (fresh) void syncCommitmentNotifications(fresh);
                        }
                      }}
                    />
                  )
                ))}
              </React.Fragment>
            );
          })}
        </ScrollView>
      )}
    </LinearGradient>
  );
}

function TaskRow({ item, palette: p, onComplete }: { item: TaskItem; palette: any; onComplete: () => void }) {
  const noteColor = GOAL_NOTE_COLORS[item.goalColorIndex % GOAL_NOTE_COLORS.length];
  // Ladder and ramp-week rows show no date in the task list (the label
  // already encodes the target); check-task and flat-step rows show the due
  // date (a flat step's is the current period's end) when present.
  const dueStr = !item.ladderWeekId && !item.rampWeekId && item.dueDate
    ? item.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  return (
    <View style={[styles.taskRow, item.done && { backgroundColor: `${p.accent}12` }]}>
      <TouchableOpacity
        style={[
          styles.checkbox,
          { borderColor: item.done ? p.accent : p.line },
          item.done && { backgroundColor: p.accent },
        ]}
        onPress={() => { if (!item.done) onComplete(); }}
        disabled={item.done}
      >
        {item.done && <Ionicons name="checkmark" size={12} color={p.surface} />}
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.taskLabel,
            { color: item.done ? p.muted : p.text },
            item.done && { textDecorationLine: 'line-through' },
          ]}
        >
          {item.label}
        </Text>
        <View style={styles.taskMeta}>
          <View style={[styles.dot, { backgroundColor: noteColor }]} />
          <Text style={[styles.metaText, { color: p.muted }]}>{item.goalTitle}</Text>
          {dueStr && (
            <>
              <Text style={{ color: p.muted }}>·</Text>
              <Text style={[styles.metaText, { color: p.muted }]}>{dueStr}</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

// A number measurable's task — no done/checkmark state (it's the daily
// action a user comes back to repeatedly), so tapping just bumps `current`
// in place and gives a light haptic tap so the tap still feels like it
// landed. Stays in the list until current reaches target.
function NumberTaskRow({ item, palette: p, onIncrement }: { item: TaskItem; palette: any; onIncrement: () => void }) {
  const noteColor = GOAL_NOTE_COLORS[item.goalColorIndex % GOAL_NOTE_COLORS.length];
  // Only the cadence-driven flavor carries a dueDate — the persistent
  // Anytime row has none, same as any other undated task.
  const dueStr = item.dueDate
    ? item.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;
  return (
    <View style={styles.taskRow}>
      <TouchableOpacity
        style={[styles.numberBtn, { borderColor: p.accent }]}
        onPress={onIncrement}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="add" size={14} color={p.accent} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={[styles.taskLabel, { color: p.text }]}>{item.label}</Text>
        <View style={styles.taskMeta}>
          <View style={[styles.dot, { backgroundColor: noteColor }]} />
          <Text style={[styles.metaText, { color: p.muted }]}>{item.goalTitle}</Text>
          {dueStr && (
            <>
              <Text style={{ color: p.muted }}>·</Text>
              <Text style={[styles.metaText, { color: p.muted }]}>{dueStr}</Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 2 },
  subtitle: { fontSize: 20, fontStyle: 'italic', marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 22, fontStyle: 'italic' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6, gap: 8 },
  sectionTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  rule: { flex: 1, height: 1 },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingVertical: 10, gap: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  numberBtn: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  taskLabel: { fontSize: 14, lineHeight: 20 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  metaText: { fontSize: 12 },
});
