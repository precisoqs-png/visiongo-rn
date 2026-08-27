import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  Animated, PanResponder, Easing, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import {
  Goal, YearData, BoardPosition,
  yearOverallProgress, isCompleted, goalProgress,
} from '../../store/models';
import { Palette, FONTS, GOAL_NOTE_COLORS } from '../../theme/themes';
import { ProgressRing } from '../shared/ProgressRing';
import { GoalNote } from './GoalNote';
import { useAppStore } from '../../store/useAppStore';
import { CompletionFlight, CompletedChip } from '../shared/CompletionFlight';

interface Props {
  yearData: YearData;
  palette: Palette;
  onGoalPress: (id: string) => void;
  onGoalMove: (id: string, pos: BoardPosition) => void;
  onGoalDelete: (id: string, title: string) => void;
  onAddGoal: () => void;
  onCompletedPress: () => void;
  // Tapping the centre bubble drops every hand-placed position so the board
  // falls back to this layout.
  onRealign: () => void;
}

export const CENTER_SIZE = 132;
// A bubble's diameter interpolates between these by the goal's own progress
// fraction (0 -> MIN_BUBBLE, 1 -> MAX_BUBBLE) before the crowd-shrink scale
// from computeRadialLayout is applied — exported so other bubble canvases
// (the goal detail screen's Measurables) size consistently with the board
// instead of picking their own numbers.
export const MIN_BUBBLE = 80;
export const MAX_BUBBLE = 120;
const BOTTOM_SAFE = 88;
const TOP_SAFE = 8;
const TRASH_SIZE = 56;
const TRASH_HIT_RADIUS = 56;
const BUBBLE_GAP = 10;
const MAX_RINGS = 3;
// Bubbles never shrink below this fraction of their normal size — past it the
// title and percentage stop being readable.
const MIN_SCALE = 0.25;

// ── Completed column (docked left) ─────────────────────────────
//
// A goal reaching 100% no longer keeps growing with the rest of the ring —
// it pops, bursts a bit of confetti, then flies over to this compact column
// instead, and drops out of the radial ring for good.
// Big enough to comfortably show a short truncated goal title (see
// CompletedChip in components/shared/CompletionFlight.tsx) — the previous
// 34px circle had no room for a label at all, so a completed goal was
// identifiable only by its color, not by name.
const CHIP_SIZE = 64;
const CHIP_GAP = 12;
const COLUMN_LEFT = 16;
const COLUMN_TOP = 118;
// Fewer than before (was 6) since each chip is now much taller — keeps the
// column from running off the bottom of shorter phone screens.
const MAX_VISIBLE_CHIPS = 4;

function columnChipCenter(index: number): Point {
  return {
    x: COLUMN_LEFT + CHIP_SIZE / 2,
    y: COLUMN_TOP + index * (CHIP_SIZE + CHIP_GAP) + CHIP_SIZE / 2,
  };
}

export interface Point { x: number; y: number }

// ── Radial layout ────────────────────────────────────────────────
//
// Deterministic: the same goal count always yields the same arrangement, and
// bubbles never overlap. Goals spread evenly around one ring while they fit,
// spill onto inner rings when they do not, and shrink only as a last resort.

// How many bubbles of `diameter` fit around a ring of radius `r` untouching.
function ringCapacity(r: number, diameter: number): number {
  const ratio = (diameter + BUBBLE_GAP) / (2 * r);
  if (ratio >= 1) return 1;
  return Math.max(1, Math.floor(Math.PI / Math.asin(ratio)));
}

// Ring radii, outermost first.
function ringRadii(rings: number, innerR: number, outerR: number): number[] {
  if (rings <= 1) return [outerR];
  const spread = (outerR - innerR) / (rings - 1);
  return Array.from({ length: rings }, (_, i) => outerR - spread * i);
}

// Split `count` bubbles across rings proportionally to each ring's capacity,
// giving leftovers to the outer rings first.
function splitAcrossRings(count: number, caps: number[]): number[] {
  const totalCap = caps.reduce((a, b) => a + b, 0);
  const counts = caps.map((c) => Math.min(c, Math.floor((count * c) / totalCap)));
  let left = count - counts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < counts.length && left > 0; i++) {
    const room = Math.min(caps[i] - counts[i], left);
    counts[i] += room;
    left -= room;
  }
  return counts;
}

export function ringPoints(n: number, r: number, cx: number, cy: number, offsetDeg: number): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = ((-90 + offsetDeg + i * (360 / n)) * Math.PI) / 180;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

interface RadialLayout {
  points: Point[];
  // Uniform shrink applied to every bubble when the board gets crowded.
  scale: number;
}

// Place `count` bubbles at the given scale, or null if they cannot fit without
// touching. Both ring radii depend on the scale: smaller bubbles can sit
// closer to the centre disc and further out before leaving the board.
function tryScale(
  count: number, scale: number, cx: number, cy: number, boardH: number, diameter: number,
  centerSize: number,
): RadialLayout | null {
  const d = diameter * scale;
  const pad = d / 2 + 6;
  const safeR = Math.min(cx - pad, cy - TOP_SAFE - pad, boardH - BOTTOM_SAFE - cy - pad);
  const innerR = centerSize / 2 + d / 2 + BUBBLE_GAP;
  // On a short board the safe ring can fall inside the centre disc; orbiting
  // slightly off-board beats sitting on top of the year bubble.
  const outerR = Math.max(safeR, innerR);

  for (let rings = 1; rings <= MAX_RINGS; rings++) {
    const radii = ringRadii(rings, innerR, outerR);
    // Rings must clear each other radially, not just around their own circle.
    if (rings > 1 && radii[0] - radii[1] < d + BUBBLE_GAP) continue;
    const caps = radii.map((r) => ringCapacity(r, d));
    if (caps.reduce((a, b) => a + b, 0) < count) continue;

    const perRing = splitAcrossRings(count, caps);
    const points: Point[] = [];
    radii.forEach((r, i) => {
      // Half-step offset per ring so inner bubbles sit between outer ones.
      const offset = perRing[i] > 0 ? (i * 180) / perRing[i] : 0;
      points.push(...ringPoints(perRing[i], r, cx, cy, offset));
    });
    return { points, scale };
  }
  return null;
}

// Largest bubble scale at which everything still fits, found by binary search
// so the answer is exact rather than snapped to a ladder of guesses. Verified
// overlap-free for up to 24 goals on every phone-sized board; past MIN_SCALE
// bubbles would be too small to read, so that floor wins over the guarantee.
// `centerSize` defaults to the board's own year-progress disc — pass the
// actual center bubble's diameter when reusing this elsewhere (the goal
// canvas's central GoalNote is a different size) so the innermost ring
// doesn't crowd or gap away from whatever's actually in the middle.
export function computeRadialLayout(
  count: number, cx: number, cy: number, boardH: number, diameter: number,
  centerSize: number = CENTER_SIZE,
): RadialLayout {
  if (count === 0) return { points: [], scale: 1 };

  const full = tryScale(count, 1, cx, cy, boardH, diameter, centerSize);
  if (full) return full;

  let lo = MIN_SCALE;
  let hi = 1;
  let best = tryScale(count, MIN_SCALE, cx, cy, boardH, diameter, centerSize);
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const attempt = tryScale(count, mid, cx, cy, boardH, diameter, centerSize);
    if (attempt) { best = attempt; lo = mid; } else { hi = mid; }
  }
  return best ?? {
    points: ringPoints(count, Math.max(cx, cy) * 0.6, cx, cy, 0),
    scale: MIN_SCALE,
  };
}

export function clampCenter(p: Point, r: number, w: number, h: number): Point {
  return {
    x: Math.min(Math.max(p.x, r), w - r),
    y: Math.min(Math.max(p.y, TOP_SAFE + r), h - BOTTOM_SAFE - r + 24),
  };
}

// ── Draggable bubble ─────────────────────────────────────────────
//
// Tap opens the goal. Press-and-hold picks the bubble up; the parent's
// PanResponder capture then follows the finger. Release either saves the
// new position or, over the trash zone, asks the parent to delete.

interface DraggableProps {
  goal: Goal;
  size: number;
  palette: Palette;
  center: Point;
  animDelay: number;
  onPress: () => void;
  onDragStart: () => void;
  onDragMove: (center: Point) => void;
  onDragEnd: (center: Point, moved: boolean) => void;
}

function DraggableBubble({
  goal, size, palette, center, animDelay,
  onPress, onDragStart, onDragMove, onDragEnd,
}: DraggableProps) {
  const pan = useRef(new Animated.ValueXY()).current;
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);

  // "Jump through the bubble": tapping grows this bubble to fill the screen
  // and fades it out while navigating, instead of a sheet sliding up over
  // the board — the goal canvas's own entry animation (a small grow-and-
  // fade-in on mount) picks up where this leaves off, on the other side of
  // the (now gestureless, non-modal) screen transition.
  const [opening, setOpening] = useState(false);
  const tapScale = useRef(new Animated.Value(1)).current;
  const tapOpacity = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    setOpening(true);
    // Eased (not linear) growth so the bubble accelerates into the screen
    // smoothly instead of covering ground at a constant rate — paired with
    // the goal canvas's own settle-in on the other side (contentScale/
    // textOpacity in app/(tabs)/board/goal/[id]/index.tsx), the whole jump reads as one
    // continuous motion rather than two abrupt animations stitched together.
    Animated.timing(tapScale, {
      toValue: 9, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
    Animated.timing(tapOpacity, { toValue: 0, duration: 240, delay: 90, useNativeDriver: true }).start();
    onPress();
  };
  // The board screen isn't necessarily remounted on the way back (a 'fade'
  // stack transition can just reveal it again) — without this, a bubble
  // tapped open would still be mid-"grow and vanish" the next time the
  // board comes into focus.
  useFocusEffect(
    React.useCallback(() => {
      setOpening(false);
      tapScale.setValue(1);
      tapOpacity.setValue(1);
    }, []),
  );

  // The bubble is laid out at its target centre; `settle` holds the offset
  // from where it used to be, springing to zero. That turns any position
  // change — a realign, a goal added or removed — into a glide, not a jump.
  const settle = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const prevCenterRef = useRef(center);
  // A bubble the user just dropped is already where they let go of it —
  // animating that would fly it back to where the drag started.
  const skipSettleRef = useRef(false);
  useEffect(() => {
    const dx = prevCenterRef.current.x - center.x;
    const dy = prevCenterRef.current.y - center.y;
    prevCenterRef.current = center;
    const skip = skipSettleRef.current;
    skipSettleRef.current = false;
    if (skip || (dx === 0 && dy === 0)) return;
    settle.setValue({ x: dx, y: dy });
    Animated.spring(settle, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      damping: 15,
      stiffness: 110,
      mass: 0.9,
    }).start();
  }, [center.x, center.y]);

  // Keep latest values in refs so the (created-once) PanResponder never
  // reads stale props.
  const centerRef = useRef(center);
  centerRef.current = center;
  const onDragMoveRef = useRef(onDragMove);
  onDragMoveRef.current = onDragMove;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  const finishDrag = (dx: number, dy: number) => {
    const moved = movedRef.current;
    draggingRef.current = false;
    movedRef.current = false;
    setDragging(false);
    pan.setValue({ x: 0, y: 0 });
    if (moved) skipSettleRef.current = true;
    onDragEndRef.current(
      { x: centerRef.current.x + dx, y: centerRef.current.y + dy },
      moved,
    );
  };

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: () => draggingRef.current,
      onPanResponderMove: (_evt, g) => {
        movedRef.current = true;
        pan.setValue({ x: g.dx, y: g.dy });
        onDragMoveRef.current({
          x: centerRef.current.x + g.dx,
          y: centerRef.current.y + g.dy,
        });
      },
      onPanResponderRelease: (_evt, g) => finishDrag(g.dx, g.dy),
      onPanResponderTerminate: (_evt, g) => finishDrag(g.dx, g.dy),
    }),
  ).current;

  const startDrag = () => {
    draggingRef.current = true;
    movedRef.current = false;
    skipSettleRef.current = false;
    setDragging(true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onDragStart();
  };

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        {
          position: 'absolute',
          left: center.x - size / 2,
          top: center.y - size / 2,
          transform: [
            { translateX: Animated.add(pan.x, settle.x) },
            { translateY: Animated.add(pan.y, settle.y) },
            { scale: tapScale },
          ],
          opacity: tapOpacity,
          zIndex: opening ? 30 : dragging ? 20 : 1,
        },
        dragging && styles.draggingBubble,
      ]}
    >
      <GoalNote
        goal={goal}
        size={size}
        palette={palette}
        onPress={handlePress}
        onLongPress={startDrag}
        onPressOut={() => {
          // Long-pressed but never moved and the pan never took over —
          // treat the release as a cancelled drag.
          if (draggingRef.current && !movedRef.current) finishDrag(0, 0);
        }}
        animDelay={animDelay}
      />
    </Animated.View>
  );
}

// ── Board ────────────────────────────────────────────────────────

export function RadialBoard({
  yearData, palette, onGoalPress, onGoalMove, onGoalDelete, onAddGoal, onCompletedPress,
  onRealign,
}: Props) {
  // Starts unmeasured — rendering bubbles against this fallback size before
  // onLayout reports the real container dimensions is what caused every
  // bubble to flash small in the top-left corner and then snap to its
  // correct spot a moment after first paint.
  //
  // Getting to `measured` depends entirely on the browser's ResizeObserver
  // (react-native-web's onLayout) actually firing with a real, non-zero
  // size. It's wired up once per mount (see useElementLayout in
  // react-native-web) — if that first callback happens to land on a
  // transitional layout (e.g. mid-reflow on a cold hard-refresh, before
  // fonts have finished loading and the flex tree has settled) and reports
  // 0x0, or the observer never delivers a callback at all, `measured`
  // would stay false forever and every bubble — the whole point of the
  // board — would simply never appear, with nothing else on screen
  // indicating anything is wrong. A goal-less-looking board is a worse
  // failure than the transient small-bubble flash this gating exists to
  // prevent, so this is now bounded on both sides: a zero-size report is
  // ignored rather than accepted as "measured", and a fallback timer
  // guarantees bubbles render with SOME size within a bounded window even
  // if onLayout never reports anything usable at all. A real onLayout
  // firing later (a genuine resize) still updates `size` normally either
  // way — this only removes the possibility of waiting forever.
  const [size, setSize] = useState({ w: 390, h: 420 });
  const [measured, setMeasured] = useState(false);
  const measuredRef = useRef(false);
  useEffect(() => {
    const fallback = setTimeout(() => {
      if (!measuredRef.current) {
        measuredRef.current = true;
        // Nothing else ever calls setSize except a successful onLayout
        // (which would have already flipped measuredRef, so we wouldn't
        // be here) — `size` is guaranteed to still be the tiny 390x420
        // placeholder at this point. Rendering bubbles against that
        // forever would be exactly the tiny-corner-bubble bug the
        // measured gate exists to prevent, just permanent instead of a
        // one-frame flash. The window's actual viewport is a much closer
        // stand-in for "this board's real size" than a hardcoded guess —
        // still not exact (doesn't subtract header/tab-bar chrome), but
        // real bubbles at a roughly-right size beat a wrong-shaped board
        // or, per the bug this whole fix addresses, no bubbles at all.
        const win = Dimensions.get('window');
        if (win.width > 0 && win.height > 0) setSize({ w: win.width, h: win.height });
        setMeasured(true);
      }
    }, 1200);
    return () => clearTimeout(fallback);
  }, []);
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const centerScale = useRef(new Animated.Value(1)).current;

  const activeGoals = yearData.goals.filter((g) => !isCompleted(g));
  const completedGoals = yearData.goals.filter((g) => isCompleted(g));
  const overallProg = yearOverallProgress(yearData);
  const pct = Math.round(overallProg * 100);

  const cx = size.w / 2;
  const cy = size.h * 0.44;

  const layout = useMemo(
    () => computeRadialLayout(activeGoals.length, cx, cy, size.h, MAX_BUBBLE),
    [activeGoals.length, cx, cy, size.h],
  );

  const trashCenter: Point = { x: size.w / 2, y: size.h - BOTTOM_SAFE / 2 - 4 };

  // Same reasoning as the ring bubbles below: on a short board cy (a plain
  // fraction of size.h) can sit close enough to the top that the centre
  // disc's own radius pushes it above this container's top edge.
  const centerPos = clampCenter({ x: cx, y: cy }, CENTER_SIZE / 2, size.w, size.h);

  // ── Completion flights ─────────────────────────────────────────
  //
  // A ring bubble that just hit 100% doesn't disappear the instant
  // `isCompleted` flips true — it keeps rendering (as an overlaid
  // CompletionFlight, not as part of the ring) until its pop/confetti/fly
  // animation finishes, then it's gone from the ring for good and shows up
  // as a chip in the completed column instead. `lastCenterRef` remembers
  // where every still-active bubble currently sits so a flight has a real
  // start point to animate from — it's updated every render, not just on
  // completion, since we don't know which goal will complete next.
  const lastCenterRef = useRef<Map<string, { center: Point; size: number }>>(new Map());
  const [flights, setFlights] = useState<Record<string, { goal: Goal; from: Point; size: number; target: Point }>>({});

  // A goal "owes" this animation when it's complete but hasn't been
  // celebrated yet (Goal.completionCelebrated === false) — a flag managed
  // centrally in useAppStore's completion-flag watcher, not derived from
  // comparing renders here. That's what makes this correct even though the
  // board is a completely different mounted component from wherever the
  // completing edit actually happened (almost always the goal detail
  // screen): the flag survives the navigation, this effect doesn't need to.
  useEffect(() => {
    const owed = yearData.goals.filter((g) => isCompleted(g) && g.completionCelebrated === false);
    if (owed.length === 0) return;
    setFlights((prev) => {
      const next = { ...prev };
      const pending = owed.filter((g) => !next[g.id]);
      if (pending.length === 0) return prev;
      const settledCount = completedGoals.filter((g) => !next[g.id] && g.completionCelebrated !== false).length;
      pending.forEach((g, i) => {
        const last = lastCenterRef.current.get(g.id);
        const from = last?.center ?? { x: cx, y: cy };
        const fromSize = last?.size ?? MIN_BUBBLE;
        const target = columnChipCenter(Math.min(settledCount + i, MAX_VISIBLE_CHIPS - 1));
        next[g.id] = { goal: g, from, size: fromSize, target };
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearData.goals]);

  const flightIds = new Set(Object.keys(flights));
  // Chips shown in the column: everyone completed except a goal still mid-
  // flight (it renders as the flight overlay instead, until it lands).
  const columnGoals = completedGoals.filter((g) => !flightIds.has(g.id));
  const visibleColumnGoals = columnGoals.slice(0, MAX_VISIBLE_CHIPS - (columnGoals.length > MAX_VISIBLE_CHIPS ? 1 : 0));
  const overflowCount = columnGoals.length - visibleColumnGoals.length;

  // Tapping the centre bubble tidies the board: every dragged position is
  // dropped and the bubbles spring back into an even radial arrangement.
  const handleRealign = () => {
    Animated.sequence([
      Animated.timing(centerScale, { toValue: 0.93, duration: 90, useNativeDriver: true }),
      Animated.spring(centerScale, {
        toValue: 1, useNativeDriver: true, damping: 7, stiffness: 200,
      }),
    ]).start();
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onRealign();
  };

  const isOverTrash = (p: Point) =>
    Math.hypot(p.x - trashCenter.x, p.y - trashCenter.y) < TRASH_HIT_RADIUS;

  const handleDragMove = (p: Point) => {
    const over = isOverTrash(p);
    setOverTrash((prev) => (prev === over ? prev : over));
  };

  const handleDragEnd = (goal: Goal, bubbleR: number, p: Point, moved: boolean) => {
    setDragging(false);
    setOverTrash(false);
    if (!moved) return;
    if (isOverTrash(p)) {
      onGoalDelete(goal.id, goal.title);
      return;
    }
    const clamped = clampCenter(p, bubbleR, size.w, size.h);
    onGoalMove(goal.id, { x: clamped.x / size.w, y: clamped.y / size.h });
  };

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        // A 0x0 report is a transitional/bogus measurement, not a real
        // "the board is zero-sized" — ignore it and keep waiting for a
        // real one (or the fallback timer above) rather than locking the
        // whole layout to it.
        if (width <= 0 || height <= 0) return;
        setSize({ w: width, h: height });
        measuredRef.current = true;
        setMeasured(true);
      }}
    >
      {/* Center circle — tap to re-align every goal bubble */}
      <Animated.View
        style={[
          styles.centerWrap,
          {
            left: centerPos.x - CENTER_SIZE / 2,
            top: centerPos.y - CENTER_SIZE / 2,
            transform: [{ scale: centerScale }],
            opacity: measured ? 1 : 0,
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleRealign}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${yearData.year}, ${pct} percent there`}
          accessibilityHint="Re-aligns your goal bubbles evenly around the centre"
          // The inner disc is absolutely positioned with no insets, so it
          // centres itself against this view's align/justify.
          style={[
            styles.centerTouch,
            Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined,
          ]}
        >
          <ProgressRing
            size={CENTER_SIZE}
            progress={overallProg}
            trackColor={palette.line}
            fillColor={palette.accent}
            strokeWidth={5}
          />
          <View
            style={[
              styles.centerInner,
              {
                width: CENTER_SIZE - 12,
                height: CENTER_SIZE - 12,
                borderRadius: (CENTER_SIZE - 12) / 2,
                backgroundColor: palette.surface,
              },
            ]}
          >
            <Text style={[styles.yearText, { color: palette.text }]}>{yearData.year}</Text>
            <Text style={[styles.pctNum, { color: palette.accent }]}>{pct}%</Text>
            <Text style={[styles.thereLabel, { color: palette.muted }]}>there</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Goal bubbles — evenly spaced on the orbit, unless the user has
          dragged them somewhere else (goal.boardPosition). */}
      {measured && activeGoals.map((goal, idx) => {
        const prog = goalProgress(goal);
        const bubbleSize = Math.round(
          (MIN_BUBBLE + prog * (MAX_BUBBLE - MIN_BUBBLE)) * layout.scale,
        );
        // computeRadialLayout can push a ring outside the "safe" radius when
        // the board is short and centerSize is large relative to it (its own
        // tryScale falls back to `Math.max(safeR, innerR)` rather than
        // leaving no room at all — see its comment) — with few goals that
        // can place a bubble's centre above this container's own top edge.
        // Clamping the deterministic ring points too, not just user-dragged
        // ones, keeps every bubble's top on-screen and below the toggle bar
        // above this container, instead of poking up into it.
        const raw = goal.boardPosition
          ? { x: goal.boardPosition.x * size.w, y: goal.boardPosition.y * size.h }
          : layout.points[idx] ?? { x: cx, y: cy };
        const base = clampCenter(raw, bubbleSize / 2, size.w, size.h);
        // Remembered so a completion flight starting from this goal knows
        // where to fly from, without the ring layout itself ever needing to
        // know about flights.
        lastCenterRef.current.set(goal.id, { center: base, size: bubbleSize });
        return (
          <DraggableBubble
            key={goal.id}
            goal={goal}
            size={bubbleSize}
            palette={palette}
            center={base}
            animDelay={idx * 70}
            onPress={() => onGoalPress(goal.id)}
            onDragStart={() => setDragging(true)}
            onDragMove={handleDragMove}
            onDragEnd={(p, moved) => handleDragEnd(goal, bubbleSize / 2, p, moved)}
          />
        );
      })}

      {/* Completion flights — a goal that just hit 100% pops, bursts
          confetti, and flies to the completed column instead of growing
          any further; see the effect above for how these get added. */}
      {Object.entries(flights).map(([id, f]) => (
        <CompletionFlight
          key={id}
          id={id}
          color={GOAL_NOTE_COLORS[f.goal.colorIndex % GOAL_NOTE_COLORS.length]}
          from={f.from}
          size={f.size}
          target={f.target}
          chipSize={CHIP_SIZE}
          onDone={() => {
            useAppStore.getState().markGoalCelebrated(id);
            setFlights((prev) => {
              const next = { ...prev };
              delete next[id];
              return next;
            });
          }}
        />
      ))}

      {/* Trash drop zone — only while dragging */}
      {dragging && (
        <View
          style={[
            styles.trashZone,
            {
              left: trashCenter.x - TRASH_SIZE / 2,
              top: trashCenter.y - TRASH_SIZE / 2,
              backgroundColor: overTrash ? '#c0392b' : palette.surface,
              borderColor: '#c0392b',
              transform: [{ scale: overTrash ? 1.15 : 1 }],
            },
          ]}
          pointerEvents="none"
        >
          <Ionicons name="trash-outline" size={24} color={overTrash ? '#fff' : '#c0392b'} />
        </View>
      )}

      {/* Completed column — docked left. Goals that have finished (per
          isCompleted) live here instead of in the main ring, each shown as a
          small chip in its own goal color rather than one flat generic
          badge. Overflow past MAX_VISIBLE_CHIPS collapses into a "+N" chip
          that opens the full Completed screen (app/completed.tsx) for the
          rest — this column is a compact on-board glance, not a
          replacement for that fuller list. */}
      {!dragging && visibleColumnGoals.map((goal, i) => {
        const center = columnChipCenter(i);
        return (
          <CompletedChip
            key={goal.id}
            label={goal.title}
            color={GOAL_NOTE_COLORS[goal.colorIndex % GOAL_NOTE_COLORS.length]}
            size={CHIP_SIZE}
            left={center.x - CHIP_SIZE / 2}
            top={center.y - CHIP_SIZE / 2}
            onPress={() => onGoalPress(goal.id)}
          />
        );
      })}
      {!dragging && overflowCount > 0 && (
        <TouchableOpacity
          onPress={onCompletedPress}
          accessibilityLabel={`${overflowCount} more completed goals`}
          style={[
            styles.completedChip,
            styles.overflowChip,
            {
              left: columnChipCenter(MAX_VISIBLE_CHIPS - 1).x - CHIP_SIZE / 2,
              top: columnChipCenter(MAX_VISIBLE_CHIPS - 1).y - CHIP_SIZE / 2,
              width: CHIP_SIZE, height: CHIP_SIZE, borderRadius: CHIP_SIZE / 2,
              backgroundColor: palette.surface, borderColor: palette.line,
            },
            Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined,
          ]}
        >
          <Text style={[styles.overflowChipText, { color: palette.text }]}>+{overflowCount}</Text>
        </TouchableOpacity>
      )}

      {/* FAB */}
      {!dragging && (
        <TouchableOpacity
          style={[
            styles.fab,
            { backgroundColor: palette.ink },
            Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined,
          ]}
          onPress={onAddGoal}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Add a goal"
        >
          <Ionicons name="add" size={26} color={palette.isDark ? palette.bg : '#fff'} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTouch: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerInner: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearText: {
    fontSize: 30,
    fontWeight: '700',
    fontFamily: FONTS.display,
    lineHeight: 34,
  },
  pctNum: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  thereLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  draggingBubble: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 10,
  },
  trashZone: {
    position: 'absolute',
    width: TRASH_SIZE,
    height: TRASH_SIZE,
    borderRadius: TRASH_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 15,
  },
  completedChip: {
    position: 'absolute',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  overflowChip: { borderStyle: 'dashed' },
  overflowChipText: { fontSize: 11, fontWeight: '700' },
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
});
