import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Modal, ScrollView, Animated,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../store/useThemeStore';
import { useAppStore } from '../../../store/useAppStore';
import {
  Measurable, TrackableItem, BoardPosition, Commitment, Cadence, StepSchedule, measurableFraction,
  removeItemCascade,
} from '../../../store/models';
import { GoalNote } from '../../../components/board/GoalNote';
import {
  Point, clampCenter, computeRadialLayout, MIN_BUBBLE, MAX_BUBBLE, CENTER_SIZE,
} from '../../../components/board/RadialBoard';
import { MeasurableBubble, tickMeasurable } from '../../../components/goal/MeasurableBubble';
import { MeasurableDetailSheet } from '../../../components/goal/MeasurableDetailSheet';
import { StepScheduleSheet } from '../../../components/goal/StepScheduleSheet';
import { CoachChat } from '../../../components/goal/CoachChat';
import { SegmentedControl } from '../../../components/shared/SegmentedControl';
import { CompletionFlight, CompletedChip } from '../../../components/shared/CompletionFlight';
import { FONTS, GOAL_NOTE_COLORS } from '../../../theme/themes';
import {
  syncCommitmentNotifications, requestNotificationPermission, alertNotificationsUnavailable,
} from '../../../services/notificationService';

const TOP_SAFE = 90;
const BOTTOM_SAFE = 120;

// ── Per-goal completed column (docked left) ───────────────────────
//
// Same beat as the board's own completed-goal column (RadialBoard.tsx) —
// pop, confetti, fly-to-column — but scoped to this one goal's own canvas
// and its measurables, not the whole-year board. Deliberately its own
// constants/container rather than reusing RadialBoard's: this canvas's
// header/safe-area geometry is different, and the two columns never share
// a screen so there's no risk of them colliding.
const CANVAS_CHIP_SIZE = 56;
const CANVAS_CHIP_GAP = 10;
const CANVAS_COLUMN_LEFT = 14;
const CANVAS_COLUMN_TOP = TOP_SAFE + 96;
const CANVAS_MAX_VISIBLE_CHIPS = 5;

function canvasChipCenter(index: number): Point {
  return {
    x: CANVAS_COLUMN_LEFT + CANVAS_CHIP_SIZE / 2,
    y: CANVAS_COLUMN_TOP + index * (CANVAS_CHIP_SIZE + CANVAS_CHIP_GAP) + CANVAS_CHIP_SIZE / 2,
  };
}

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
  //
  // The scale range starts much closer to 1 (0.94, not 0.85) and text fades
  // in on its own delayed timer (textOpacity) instead of riding the
  // container's scale from the start — at a steep scale, text near the
  // container's edges visibly slides inward as it grows, reading as "flying
  // toward the viewer" rather than a calm zoom. Letting the frame settle
  // first, then having the title/copy simply fade in place once it's basically
  // there, removes that flight motion while keeping the same "jump into the
  // bubble" concept.
  const contentScale = useRef(new Animated.Value(0.94)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(contentScale, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 140 }),
      Animated.timing(contentOpacity, { toValue: 1, duration: 240, useNativeDriver: true }),
    ]).start();
    Animated.timing(textOpacity, { toValue: 1, duration: 260, delay: 140, useNativeDriver: true }).start();
  }, []);

  const handleBackToBoard = () => {
    textOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(contentScale, { toValue: 0.94, duration: 200, useNativeDriver: true }),
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
  const coachScrollRef = useRef<ScrollView>(null);

  // ── Completion flights (measurables) ───────────────────────────
  //
  // `seenFracRef` starts out populated from whatever this goal's measurables
  // look like on the very first render of this screen — so a measurable
  // that was ALREADY complete before the user opened this canvas just shows
  // up as a resting chip in the column immediately, and only a 0->1
  // transition observed live (while this screen is mounted) plays the
  // pop/confetti/fly animation. Same "only celebrate a transition you
  // actually witnessed" rule the board's own completion-flag watcher uses
  // in useAppStore.ts, just kept local to this screen since there's no
  // per-measurable persisted "celebrated" flag to hang it on.
  const seenFracRef = useRef<Map<string, number> | null>(null);
  const lastMeasurableCenterRef = useRef<Map<string, { center: Point; size: number }>>(new Map());
  const [measurableFlights, setMeasurableFlights] = useState<
    Record<string, { measurable: Measurable; from: Point; size: number; target: Point }>
  >({});
  const [settledCompletedIds, setSettledCompletedIds] = useState<string[]>([]);

  const cx = size.w / 2;
  const cy = TOP_SAFE + (size.h - TOP_SAFE - BOTTOM_SAFE) * 0.42;

  useEffect(() => {
    if (!goal) return;
    const measurables = goal.items.filter((it) => it.parentId == null);
    const frac = new Map<string, number>(measurables.map((m) => [m.id, measurableFraction(m, goal)]));
    if (seenFracRef.current === null) {
      // First render of this screen for this goal — anything already
      // complete is a resting chip from the start, not a transition.
      seenFracRef.current = frac;
      setSettledCompletedIds(measurables.filter((m) => frac.get(m.id)! >= 1).map((m) => m.id));
      return;
    }
    const prev = seenFracRef.current;
    const justCompleted = measurables.filter(
      (m) => frac.get(m.id)! >= 1 && (prev.get(m.id) ?? 0) < 1,
    );
    seenFracRef.current = frac;
    if (justCompleted.length === 0) return;
    setMeasurableFlights((current) => {
      const next = { ...current };
      const already = justCompleted.filter((m) => !next[m.id]);
      if (already.length === 0) return current;
      setSettledCompletedIds((ids) => {
        const startIndex = ids.length;
        already.forEach((m, i) => {
          const last = lastMeasurableCenterRef.current.get(m.id);
          const from = last?.center ?? { x: cx, y: cy };
          const fromSize = last?.size ?? MIN_BUBBLE;
          next[m.id] = { measurable: m, from, size: fromSize, target: canvasChipCenter(startIndex + i) };
        });
        return ids;
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.items]);

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
      items: g.items.map((x) => (x.id === m.id ? m : x)),
    }));
    setOpenMeasurable((cur) => (cur?.id === m.id ? m : cur));
  };

  const deleteMeasurableInPlace = (measurableId: string) => {
    // Cascade: this is called on any item opened from the canvas, including
    // a top-level Milestone — its child Measurable(s) must go with it, or
    // they're left with a dangling parentId (invisible on the canvas, but
    // still rendered on the Measurables tab, and misreading its own progress
    // — see removeItemCascade's comment in store/models.ts).
    patchGoal((g) => ({ items: removeItemCascade(g.items, measurableId) }));
  };

  // Reminder sheet for ONE Commitment nested inside whichever item is
  // currently open in the detail sheet — same pattern measurables.tsx uses
  // for its own CommitmentsBlock bells, wired here too since a top-level
  // 'commitment'-type Milestone (own commitments, no children) can be opened
  // straight from the canvas without ever visiting the Measurables tab.
  const [scheduleForCommitment, setScheduleForCommitment] = useState<{ item: Measurable; step: Commitment } | null>(null);

  const resyncCommitmentNotifications = () => {
    const fresh = useAppStore.getState().getGoal(id!);
    if (fresh && useAppStore.getState().notificationsMasterOn) {
      void syncCommitmentNotifications(fresh);
    }
  };

  // `scheduleForCommitment.item` is a snapshot taken when the schedule sheet
  // was OPENED — it can go stale if the user edits the same item (e.g. a
  // check-in) while the sheet is still open. Re-read the current item from
  // the store right before applying the patch, same "read fresh state, not
  // the render closure" pattern patchGoal/resyncCommitmentNotifications
  // already use above, so a concurrent edit is never silently clobbered.
  const freshTargetItem = (): Measurable | undefined => {
    const target = scheduleForCommitment;
    if (!target) return undefined;
    const fresh = useAppStore.getState().getGoal(id!);
    return fresh?.items.find((it) => it.id === target.item.id);
  };

  const saveCommitmentSchedule = async (
    patch: { cadence: Cadence; intervalDays?: number; schedule: StepSchedule },
  ) => {
    const target = scheduleForCommitment;
    if (!target) return;
    const apply = (schedule: StepSchedule) => {
      const currentItem = freshTargetItem() ?? target.item;
      const updated: Measurable = {
        ...currentItem,
        commitments: currentItem.commitments.map((s) => (
          s.id === target.step.id ? { ...s, cadence: patch.cadence, intervalDays: patch.intervalDays, schedule } : s
        )),
      };
      updateMeasurableInPlace(updated);
    };
    if (patch.schedule.on) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        alertNotificationsUnavailable();
        apply({ ...patch.schedule, on: false });
        setScheduleForCommitment(null);
        return;
      }
    }
    apply(patch.schedule);
    setScheduleForCommitment(null);
    resyncCommitmentNotifications();
  };

  const turnOffCommitmentReminder = () => {
    const target = scheduleForCommitment;
    if (!target) return;
    const currentItem = freshTargetItem() ?? target.item;
    updateMeasurableInPlace({
      ...currentItem,
      commitments: currentItem.commitments.map((s) => (
        s.id === target.step.id ? { ...s, schedule: { ...s.schedule, on: false } } : s
      )),
    });
    setScheduleForCommitment(null);
    resyncCommitmentNotifications();
  };

  if (!hydrated || !goal) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.bg }}>
        <Text style={{ color: p.muted }}>{hydrated ? 'Goal not found' : 'Loading…'}</Text>
      </View>
    );
  }

  // Only top-level items (Milestones — every Measurable now requires a
  // parent and can no longer stand alone) ever render as canvas bubbles.
  const goalMeasurables = goal.items.filter((it) => it.parentId == null);

  // Measurables shown as regular canvas bubbles: not complete, and not
  // currently mid-flight to the completed column (those render as
  // CompletionFlight overlays instead — see below).
  const flightIds = new Set(Object.keys(measurableFlights));
  const activeMeasurables = goalMeasurables.filter(
    (m) => measurableFraction(m, goal) < 1 && !flightIds.has(m.id),
  );
  const completedMeasurables = goalMeasurables.filter(
    (m) => settledCompletedIds.includes(m.id) && !flightIds.has(m.id),
  );

  // Same sizing/packing logic as a goal bubble on the main board: diameter
  // interpolates MIN_BUBBLE..MAX_BUBBLE by the measurable's own progress
  // fraction, uniformly shrunk (layout.scale) only as far as needed for
  // every bubble to fit without overlapping — centerSize passed explicitly
  // since this canvas's central GoalNote is a different size than the
  // board's own year-progress disc.
  const layout = computeRadialLayout(activeMeasurables.length, cx, cy, size.h, MAX_BUBBLE, CENTER_SIZE);
  const noteColor = GOAL_NOTE_COLORS[goal.colorIndex % GOAL_NOTE_COLORS.length];

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
      <Animated.View style={[styles.header, { zIndex: 10, elevation: 10, opacity: textOpacity }]}>
        <View>
          <Text style={[styles.eyebrow, { color: p.muted }]}>GOAL CANVAS</Text>
          <Text style={[styles.motto, { color: p.text }]} numberOfLines={1}>{goal.title}</Text>
        </View>
      </Animated.View>

      <Animated.View style={[styles.yearRow, { zIndex: 10, elevation: 10, opacity: textOpacity }]}>
        <TouchableOpacity style={styles.yearCenter} onPress={handleBackToBoard} accessibilityLabel="Back to board">
          <Text style={[styles.yearDiamond, { color: p.accent }]}>◈</Text>
          <Text style={[styles.yearNum, { color: p.text }]}>{selectedYear}</Text>
          <Text style={[styles.yearDiamond, { color: p.accent }]}>◈</Text>
        </TouchableOpacity>
      </Animated.View>

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

        {activeMeasurables.map((m, idx) => {
          const bubbleSize = Math.round(
            (MIN_BUBBLE + measurableFraction(m, goal) * (MAX_BUBBLE - MIN_BUBBLE)) * layout.scale,
          );
          const saved = goal.measurableBubblePositions?.[m.id];
          const raw = saved
            ? { x: saved.x * size.w, y: saved.y * size.h }
            : layout.points[idx] ?? { x: cx, y: cy };
          const center = clampCenter(raw, bubbleSize / 2, size.w, size.h);
          // Remembered so a completion flight starting from this bubble
          // knows where to fly from — same pattern as RadialBoard's
          // lastCenterRef, updated every render since we don't know ahead
          // of time which measurable will complete next.
          lastMeasurableCenterRef.current.set(m.id, { center, size: bubbleSize });
          // Same "Milestone with children is a pure container" rule
          // MeasurableCard's own `hasChildren`/`readOnly` uses — a hold
          // gesture on one of these must not tick a `done` flag that
          // measurableFraction no longer reads once there are children.
          const hasChildren = goal.items.some((it) => it.parentId === m.id);
          return (
            <MeasurableBubble
              key={m.id}
              measurable={m}
              goal={goal}
              size={bubbleSize}
              center={center}
              palette={p}
              noteColor={noteColor}
              canvasSize={size}
              onTap={() => setOpenMeasurable(m)}
              onTick={() => updateMeasurableInPlace(tickMeasurable(m))}
              tickDisabled={hasChildren}
              onDragEnd={(c) => savePosition(m.id, c)}
            />
          );
        })}

        {goalMeasurables.length === 0 && (
          <View style={[styles.emptyHint, { top: cy + CENTER_SIZE / 2 + 24 }]}>
            <Text style={[styles.emptyHintText, { color: p.muted }]}>
              No measurables yet — ask the Coach to add some, or open Milestones to add one.
            </Text>
          </View>
        )}

        {/* Completion flights — a measurable that just hit 100% pops, bursts
            confetti, and flies to this goal's own completed column instead
            of sitting on the canvas fully filled. */}
        {Object.entries(measurableFlights).map(([mid, f]) => (
          <CompletionFlight
            key={mid}
            id={mid}
            color={noteColor}
            from={f.from}
            size={f.size}
            target={f.target}
            chipSize={CANVAS_CHIP_SIZE}
            onDone={() => {
              setMeasurableFlights((current) => {
                const next = { ...current };
                delete next[mid];
                return next;
              });
              setSettledCompletedIds((ids) => (ids.includes(mid) ? ids : [...ids, mid]));
            }}
          />
        ))}

        {/* Completed column — docked left, this goal's own measurables that
            have finished, separated from the ones still in progress. */}
        {completedMeasurables.slice(
          0,
          completedMeasurables.length > CANVAS_MAX_VISIBLE_CHIPS
            ? CANVAS_MAX_VISIBLE_CHIPS - 1
            : CANVAS_MAX_VISIBLE_CHIPS,
        ).map((m, i) => {
          const center = canvasChipCenter(i);
          return (
            <CompletedChip
              key={m.id}
              label={m.label}
              color={noteColor}
              size={CANVAS_CHIP_SIZE}
              left={center.x - CANVAS_CHIP_SIZE / 2}
              top={center.y - CANVAS_CHIP_SIZE / 2}
              onPress={() => setOpenMeasurable(m)}
            />
          );
        })}
        {completedMeasurables.length > CANVAS_MAX_VISIBLE_CHIPS && (
          <View
            pointerEvents="none"
            style={[
              styles.overflowHint,
              {
                left: canvasChipCenter(CANVAS_MAX_VISIBLE_CHIPS).x - CANVAS_CHIP_SIZE / 2,
                top: canvasChipCenter(CANVAS_MAX_VISIBLE_CHIPS).y - CANVAS_CHIP_SIZE / 2,
                width: CANVAS_CHIP_SIZE, borderColor: p.line,
              },
            ]}
          >
            <Text style={[styles.overflowHintText, { color: p.muted }]}>
              +{completedMeasurables.length - CANVAS_MAX_VISIBLE_CHIPS}
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
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <ScrollView
                ref={coachScrollRef}
                contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }}
                keyboardShouldPersistTaps="handled"
              >
                <CoachChat
                  goal={goal}
                  palette={p}
                  onRequestScrollToEnd={() => coachScrollRef.current?.scrollToEnd({ animated: true })}
                />
              </ScrollView>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <MeasurableDetailSheet
        measurable={openMeasurable}
        goal={goal}
        goalTargetDate={goal.targetDate}
        palette={p}
        noteColor={noteColor}
        onUpdate={updateMeasurableInPlace}
        onDelete={(mid) => { deleteMeasurableInPlace(mid); setOpenMeasurable(null); }}
        onDismiss={() => setOpenMeasurable(null)}
        onOpenCommitmentSchedule={(m, step) => setScheduleForCommitment({ item: m, step })}
      />

      {/* Reminder sheet for one Commitment nested inside whichever item is
          open above — same component/logic as measurables.tsx's own. */}
      <StepScheduleSheet
        visible={!!scheduleForCommitment}
        step={scheduleForCommitment?.step ?? null}
        palette={p}
        onSave={(patch) => { void saveCommitmentSchedule(patch); }}
        onTurnOff={turnOffCommitmentReminder}
        onDismiss={() => setScheduleForCommitment(null)}
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
  overflowHint: {
    position: 'absolute', height: CANVAS_CHIP_SIZE, borderRadius: CANVAS_CHIP_SIZE / 2,
    borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center',
  },
  overflowHintText: { fontSize: 12, fontWeight: '700' },
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
