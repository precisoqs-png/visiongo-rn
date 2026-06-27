import React from 'react';
import { View, Text, TouchableOpacity, Dimensions, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/useThemeStore';
import { useAppStore } from '../store/useAppStore';
import { isCompleted } from '../store/models';
import { GOAL_NOTE_COLORS } from '../theme/themes';
import { hexAlpha, FONTS } from '../theme/themes';
import { ProgressRing } from '../components/shared/ProgressRing';

const { width } = Dimensions.get('window');
const CENTER_SIZE = 110;
const NOTE_SIZE = 76;

export default function CompletedScreen() {
  const router = useRouter();
  const palette = useThemeStore((s) => s.palette);
  const p = palette;
  const yd = useAppStore((s) => s.currentYearData());
  const selectedYear = useAppStore((s) => s.selectedYear);

  const completedGoals = yd?.goals.filter((g) => isCompleted(g)) ?? [];
  const cx = width / 2;
  const cy = 210;
  const radius = Math.min(width, 390) * 0.37;
  const n = Math.max(completedGoals.length, 1);

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: p.muted }]}>{selectedYear}</Text>
          <Text style={[styles.title, { color: p.accent, fontFamily: FONTS.display }]}>
            Goals Achieved!
          </Text>
        </View>
      </View>

      <View style={[styles.board, { height: cy * 2 }]}>
        <View style={[styles.centerWrap, { left: cx - CENTER_SIZE / 2, top: cy - CENTER_SIZE / 2 }]}>
          <ProgressRing
            size={CENTER_SIZE}
            progress={1}
            trackColor={p.accent}
            fillColor={p.accent}
            strokeWidth={3}
          />
          <View
            style={[
              styles.centerInner,
              {
                width: CENTER_SIZE - 6,
                height: CENTER_SIZE - 6,
                borderRadius: (CENTER_SIZE - 6) / 2,
                backgroundColor: p.surface,
              },
            ]}
          >
            <Text style={[styles.countText, { color: p.accent, fontFamily: FONTS.display }]}>
              {completedGoals.length}
            </Text>
            <Text style={[styles.countLabel, { color: p.muted }]}>Goals Achieved!</Text>
          </View>
        </View>

        {completedGoals.map((goal, idx) => {
          const angleDeg = -90 + idx * (360 / n);
          const angleRad = (angleDeg * Math.PI) / 180;
          const x = cx + radius * Math.cos(angleRad);
          const y = cy + radius * Math.sin(angleRad);
          return (
            <TouchableOpacity
              key={goal.id}
              style={[
                styles.bubble,
                {
                  left: x - NOTE_SIZE / 2,
                  top: y - NOTE_SIZE / 2,
                  width: NOTE_SIZE, height: NOTE_SIZE,
                  borderRadius: NOTE_SIZE / 2,
                  backgroundColor: hexAlpha(p.accent, 0.62),
                  borderColor: p.accent, borderWidth: 1.5,
                },
              ]}
              onPress={() => router.push(`/goal/${goal.id}`)}
              activeOpacity={0.8}
            >
              <Ionicons name="checkmark" size={16} color={p.surface} />
              <Text style={[styles.bubbleText, { color: p.surface }]} numberOfLines={2}>
                {goal.title}
              </Text>
            </TouchableOpacity>
          );
        })}

        {completedGoals.length === 0 && (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: p.muted }]}>
              No completed goals yet — keep going!
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.inProgressBtn, { backgroundColor: p.surface }]}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back-circle-outline" size={16} color={p.text} />
          <Text style={[styles.inProgressText, { color: p.text }]}>In Progress</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 2 },
  title: { fontSize: 26, fontWeight: '700', marginTop: 2 },
  board: { position: 'relative', width: '100%' },
  centerWrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  centerInner: { position: 'absolute', alignItems: 'center', justifyContent: 'center', padding: 4 },
  countText: { fontSize: 34, fontWeight: '700' },
  countLabel: { fontSize: 9, textAlign: 'center' },
  bubble: {
    position: 'absolute',
    alignItems: 'center', justifyContent: 'center',
    padding: 6,
  },
  bubbleText: { fontSize: 9, textAlign: 'center', marginTop: 2 },
  inProgressBtn: {
    position: 'absolute',
    bottom: 12, left: 20,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 20, gap: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  inProgressText: { fontSize: 13, fontWeight: '600' },
  empty: { position: 'absolute', top: '40%', left: 0, right: 0, alignItems: 'center' },
  emptyText: { fontSize: 15 },
});
