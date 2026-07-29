import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  Animated, PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  Goal, YearData, BoardPosition,
  yearOverallProgress, isCompleted, goalProgress,
} from '../../store/models';
import { Palette, FONTS } from '../../theme/themes';
import { ProgressRing } from '../shared/ProgressRing';
import { GoalNote } from './GoalNote';

interface Props {
  yearData: YearData;
  palette: Palette;
  onGoalPress: (id: string) => void;
  onGoalMove: (id: string, pos: BoardPosition) => void;
  onGoalDelete: (id: string, title: string) => void;
  onAddGoal: () => void;
  onCompletedPress: () => void;
}

const CENTER_SIZE = 132;
const MIN_BUBBLE = 70;
const MAX_BUBBLE = 102;
const BOTTOM_SAFE = 88;
const TOP_SAFE = 8;
const TRASH_SIZE = 56;
const TRASH_HIT_RADIUS = 56;

interface Point { x: number; y: number }

// Evenly distributed positions on a single orbit ring, starting at 12 o'clock.
function orbitPosition(idx: number, total: number, cx: number, cy: number, orbitR: number): Point {
  const angle = ((-90 + idx * (360 / Math.max(total, 1))) * Math.PI) / 180;
  return { x: cx + orbitR * Math.cos(angle), y: cy + orbitR * Math.sin(angle) };
}

function clampCenter(p: Point, r: number, w: number, h: number): Point {
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
          transform: pan.getTranslateTransform(),
          zIndex: dragging ? 20 : 1,
        },
        dragging && styles.draggingBubble,
      ]}
    >
      <GoalNote
        goal={goal}
        size={size}
        palette={palette}
        onPress={onPress}
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
}: Props) {
  const [size, setSize] = useState({ w: 390, h: 420 });
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);

  const activeGoals = yearData.goals.filter((g) => !isCompleted(g));
  const completedCount = yearData.goals.filter((g) => isCompleted(g)).length;
  const overallProg = yearOverallProgress(yearData);
  const pct = Math.round(overallProg * 100);

  const cx = size.w / 2;
  const cy = size.h * 0.44;

  const maxBubbleR = MAX_BUBBLE / 2 + 10;
  const safeOrbitR = Math.min(
    cx - maxBubbleR,
    cy - TOP_SAFE - maxBubbleR,
    size.h - BOTTOM_SAFE - cy - maxBubbleR,
  );
  const orbitR = Math.max(safeOrbitR, CENTER_SIZE / 2 + maxBubbleR + 6);

  const trashCenter: Point = { x: size.w / 2, y: size.h - BOTTOM_SAFE / 2 - 4 };

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
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {/* Center circle */}
      <View
        style={[
          styles.centerWrap,
          { left: cx - CENTER_SIZE / 2, top: cy - CENTER_SIZE / 2 },
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
      </View>

      {/* Goal bubbles — evenly spaced on the orbit, unless the user has
          dragged them somewhere else (goal.boardPosition). */}
      {activeGoals.map((goal, idx) => {
        const prog = goalProgress(goal);
        const bubbleSize = Math.round(MIN_BUBBLE + prog * (MAX_BUBBLE - MIN_BUBBLE));
        const base = goal.boardPosition
          ? clampCenter(
              { x: goal.boardPosition.x * size.w, y: goal.boardPosition.y * size.h },
              bubbleSize / 2, size.w, size.h,
            )
          : orbitPosition(idx, activeGoals.length, cx, cy, orbitR);
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

      {/* Completed goals bubble — bottom-left */}
      {completedCount > 0 && !dragging && (
        <TouchableOpacity
          style={styles.completedWrap}
          onPress={onCompletedPress}
          activeOpacity={0.8}
        >
          <View style={[styles.completedBubble, { backgroundColor: palette.accent }]}>
            <Ionicons name="checkmark" size={24} color={palette.surface} />
            <View style={[styles.completedBadge, { backgroundColor: palette.surface }]}>
              <Text style={[styles.completedBadgeText, { color: palette.accent }]}>
                {completedCount}
              </Text>
            </View>
          </View>
          <Text style={[styles.completedLabel, { color: palette.muted }]}>Completed</Text>
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
  completedWrap: {
    position: 'absolute',
    bottom: 10,
    left: 20,
    alignItems: 'center',
  },
  completedBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  completedBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  completedBadgeText: { fontSize: 11, fontWeight: '700' },
  completedLabel: { fontSize: 10, fontWeight: '600', marginTop: 3 },
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
