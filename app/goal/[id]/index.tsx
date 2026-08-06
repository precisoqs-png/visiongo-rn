import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Modal, ScrollView, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../store/useThemeStore';
import { useAppStore } from '../../../store/useAppStore';
import { Measurable, BoardPosition, measurableFraction } from '../../../store/models';
import { GoalNote } from '../../../components/board/GoalNote';
import {
  Point, clampCenter, computeRadialLayout, MIN_BUBBLE, MAX_BUBBLE, CENTER_SIZE,
} from '../../../components/board/RadialBoard';
import { MeasurableBubble, tickMeasurable } from '../../../components/goal/MeasurableBubble';
import { MeasurableDetailSheet } from '../../../components/goal/MeasurableDetailSheet';
import { CoachChat } from '../../../components/goal/CoachChat';
import { SegmentedControl } from '../../../components/shared/SegmentedControl';
import { FONTS } from '../../../theme/themes';

const TOP_SAFE = 90;
const BOTTOM_SAFE = 120;

// The goal's own bubble canvas — same visual language as a bubble on the
// main board (GoalNote for the central goal bubble, the same drag/settle
// mechanics as RadialBoard's DraggableBubble for the smaller ones around
// it), scoped to one goal's Measurables instead of a year's Goals.
export default function GoalCanvasScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = useThemeStore((s) => s.palette);
  const p = palette;

  const updateGoal = useAppStore((s) => s.updateGoal);
  const selectedYear = useAppStore((s) => s.selectedYear);
  const goal = useAppStore((s) =>
    s.years.find((y) => y.year === s.selectedYear)?.goals.find((g) => g.id === id),
  );

  // "Jump through the bubble" transition: this screen grows in from a
  // slightly-shrunk, faded-out start state on mount (paired with the board
  // scaling the tapped bubble up as it navigates away, in RadialBoard), and
  // shrinks back out — the reverse of the same animation — when the user
  // taps the year row to leave, instead of a sheet sliding away.
  const contentScale = useRef(new Animated.Value(0.85)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(contentScale, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 160 }),
      Animated.timing(contentOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleBackToBoard = () => {
    Animated.parallel([
      Animated.timing(contentScale, { toValue: 0.85, duration: 200, useNativeDriver: true }),
      Animated.timing(contentOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => router.replace('/(tabs)/board'));
  };

  // Same SSR/hydration gate as the milestones page (see its comment) — this
  // is the URL /goal/[id] resolves to first, so it needs it too.
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());
  React.useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  const [size, setSize] = useState({ w: 390, h: 640 });
  const [openMeasurable, setOpenMeasurable] = useState<Measurable | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);

  // Reads the goal fresh from the store rather than trusting the `goal`
  // render closure — several bubbles can be mid-gesture at once, each
  // holding its own callback closures, so writes must always apply on top
  // of the latest state rather than whatever this component last rendered
  // with (same defensive pattern the milestones page already uses for its
  // notification resyncs).
  const patchGoal = (fn: (g: NonNullable<typeof goal>) => Partial<NonNullable<typeof goal>>) => {
    const fresh = useAppStore.getState().getGoal(id!);
    if (!fresh) return;
    updateGoal({ ...fresh, ...fn(fresh) });
  };

  const savePosition = (measurableId: string, center: Point) => {
    patchGoal((g) => ({
      measurableBubblePositions: {
        ...(g.measurableBubblePositions ?? {}),
        [measurableId]: { x: center.x / size.w, y: center.y / size.h },
      },
    }));
  };

  const updateMeasurableInPlace = (m: Measurable) => {
    patchGoal((g) => ({
      measurables: g.measurables.map((x) => (x.id === m.id ? m : x)),
    }));
    setOpenMeasurable((cur) => (cur?.id === m.id ? m : cur));
  };

  const deleteMeasurableInPlace = (measurableId: string) => {
    patchGoal((g) => ({ measurables: g.measurables.filter((x) => x.id !== measurableId) }));
  };

  if (!hydrated || !goal) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.bg }}>
        <Text style={{ color: p.muted }}>{hydrated ? 'Goal not found' : 'Loading…'}</Text>
      </View>
    );
  }

  const cx = size.w / 2;
  const cy = TOP_SAFE + (size.h - TOP_SAFE - BOTTOM_SAFE) * 0.42;
  // Same sizing/packing logic as a goal bubble on the main board: diameter
  // interpolates MIN_BUBBLE..MAX_BUBBLE by the measurable's own progress
  // fraction, uniformly shrunk (layout.scale) only as far as needed for
  // every bubble to fit without overlapping — centerSize passed explicitly
  // since this canvas's central GoalNote is a different size than the
  // board's own year-progress disc.
  const layout = computeRadialLayout(goal.measurables.length, cx, cy, size.h, MAX_BUBBLE, CENTER_SIZE);

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      <Animated.View style={{ flex: 1, opacity: contentOpacity, transform: [{ scale: contentScale }] }}>
      {/* Header — same eyebrow/tagline styling as the main board's, and the
          same year row (chevrons + "◈ year ◈"), just swapped for this
          goal's own title instead of the board's motto. Tapping the year
          row zooms back out to the board (see handleBackToBoard). */}
      {/* zIndex/elevation here isn't decorative: measurable bubbles below are
          absolutely positioned and this container doesn't clip overflow, so
          without an explicit stacking guarantee a bubble placed near the top
          of the canvas could paint over the back-to-board tap target. */}
      <View style={[styles.header, { zIndex: 10, elevation: 10 }]}>
        <View>
          <Text style={[styles.eyebrow, { color: p.muted }]}>GOAL CANVAS</Text>
          <Text style={[styles.motto, { color: p.text }]} numberOfLines={1}>{goal.title}</Text>
        </View>
      </View>

      <View style={[styles.yearRow, { zIndex: 10, elevation: 10 }]}>
        <TouchableOpacity style={styles.yearCenter} onPress={handleBackToBoard} accessibilityLabel="Back to board">
          <Text style={[styles.yearDiamond, { color: p.accent }]}>◈</Text>
          <Text style={[styles.yearNum, { color: p.text }]}>{selectedYear}</Text>
          <Text style={[styles.yearDiamond, { color: p.accent }]}>◈</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.segmentedWrap}>
        <SegmentedControl
          segments={[
            { key: 'measurables', label: 'Measurables' },
            { key: 'milestones', label: 'Milestones' },
          ]}
          onChange={(tab) => router.push(`/goal/${id}/${tab}`)}
          palette={p}
        />
      </View>

      <View
        style={{ flex: 1 }}
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        <View style={[styles.centerWrap, { left: cx - CENTER_SIZE / 2, top: cy - CENTER_SIZE / 2 }]}>
          <GoalNote goal={goal} size={CENTER_SIZE} palette={p} onPress={() => router.push(`/goal/${id}/milestones`)} />
        </View>

        {goal.measurables.map((m, idx) => {
          const bubbleSize = Math.round(
            (MIN_BUBBLE + measurableFraction(m) * (MAX_BUBBLE - MIN_BUBBLE)) * layout.scale,
          );
          const saved = goal.measurableBubblePositions?.[m.id];
          const raw = saved
            ? { x: saved.x * size.w, y: saved.y * size.h }
            : layout.points[idx] ?? { x: cx, y: cy };
          const center = clampCenter(raw, bubbleSize / 2, size.w, size.h);
          return (
            <MeasurableBubble
              key={m.id}
              measurable={m}
              size={bubbleSize}
              center={center}
              palette={p}
              canvasSize={size}
              onTap={() => setOpenMeasurable(m)}
              onTick={() => updateMeasurableInPlace(tickMeasurable(m))}
              onDragEnd={(c) => savePosition(m.id, c)}
            />
          );
        })}

        {goal.measurables.length === 0 && (
          <View style={[styles.emptyHint, { top: cy + CENTER_SIZE / 2 + 24 }]}>
            <Text style={[styles.emptyHintText, { color: p.muted }]}>
              No measurables yet — ask the Coach to add some, or open Milestones to add one.
            </Text>
          </View>
        )}
      </View>

      {/* Coach bubble — a small dark FAB that slides up the same coach chat
          the milestones page embeds inline, reused as-is. */}
      <TouchableOpacity
        style={[styles.coachFab, { backgroundColor: p.ink }]}
        onPress={() => setCoachOpen(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="sparkles" size={20} color={p.isDark ? p.bg : '#fff'} />
        <Text style={[styles.coachFabText, { color: p.isDark ? p.bg : '#fff' }]}>Coach</Text>
      </TouchableOpacity>
      </Animated.View>

      <Modal visible={coachOpen} transparent animationType="slide" onRequestClose={() => setCoachOpen(false)}>
        <TouchableOpacity style={styles.coachBackdrop} activeOpacity={1} onPress={() => setCoachOpen(false)}>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.coachSheet, { backgroundColor: p.bg }]}
            onPress={(e) => e.stopPropagation?.()}
          >
            <View style={styles.coachHandleRow}>
              <View style={[styles.coachHandle, { backgroundColor: p.line }]} />
              <TouchableOpacity
                onPress={() => setCoachOpen(false)}
                style={styles.coachClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="chevron-down" size={18} color={p.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
              <CoachChat goal={goal} palette={p} />
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <MeasurableDetailSheet
        measurable={openMeasurable}
        goalTargetDate={goal.targetDate}
        palette={p}
        onUpdate={updateMeasurableInPlace}
        onDelete={(mid) => { deleteMeasurableInPlace(mid); setOpenMeasurable(null); }}
        onDismiss={() => setOpenMeasurable(null)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  // header/eyebrow/motto/yearRow/yearCenter/yearDiamond/yearNum are a
  // deliberate 1:1 copy of app/(tabs)/board.tsx's own styles, so this top
  // section reads as the same header, not a re-styled lookalike.
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 8,
  },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 2 },
  motto: { fontSize: 15, fontStyle: 'italic', marginTop: 2 },
  yearRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 20, paddingVertical: 6,
  },
  yearCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  yearDiamond: { fontSize: 14 },
  yearNum: { fontSize: 18, fontWeight: '700', fontFamily: FONTS.display },
  segmentedWrap: { marginHorizontal: 20, marginBottom: 6 },
  centerWrap: { position: 'absolute' },
  emptyHint: { position: 'absolute', left: 32, right: 32, alignItems: 'center' },
  emptyHintText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  coachFab: {
    position: 'absolute', bottom: 20, right: 20,
    width: 62, height: 62, borderRadius: 31,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  coachFabText: { fontSize: 9, fontWeight: '700', marginTop: 2 },
  coachBackdrop: { flex: 1, backgroundColor: '#00000070', justifyContent: 'flex-end' },
  coachSheet: {
    height: '58%', borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 8,
  },
  coachHandleRow: { alignItems: 'center', paddingVertical: 6 },
  coachHandle: { width: 36, height: 4, borderRadius: 2 },
  coachClose: { position: 'absolute', right: 14, top: 2 },
});
