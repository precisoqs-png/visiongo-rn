import React, { useRef } from 'react';
import { Animated, PanResponder, Text, View, StyleSheet, Platform } from 'react-native';
import {
  Measurable, measurableFraction, steppedValue, formatNumber,
} from '../../store/models';
import { Point, clampCenter } from '../board/RadialBoard';
import { Palette, hexAlpha } from '../../theme/themes';
import { useCompletionPulse } from '../shared/useCompletionPulse';

// A press-and-hold that stays put ticks the measurable off; moving past this
// many px before the hold timer fires cancels the tick and starts a drag
// instead. Matches the touch-slop feel of the board's own bubbles.
const MOVE_THRESHOLD = 9;
const HOLD_MS = 450;

// `adjustsFontSizeToFit`/`minimumFontScale` are iOS/Android-only — React
// Native Web silently ignores both, so they can't be relied on for a bubble
// that also has to render (and be Playwright-verified) on web. This
// simulates greedy word-wrapping at a candidate font size and picks the
// largest one that fits within LINE_BUDGET lines, so long labels shrink
// instead of truncating on every platform the app runs on.
const LINE_BUDGET = 4;

function estimatedLineCount(label: string, fontSize: number, maxWidth: number): number {
  const charWidth = fontSize * 0.56; // rough average glyph width for this font
  const maxChars = Math.max(1, Math.floor(maxWidth / charWidth));
  let lines = 1;
  let lineLen = 0;
  for (const word of label.split(' ')) {
    const wLen = word.length;
    const candidate = lineLen === 0 ? wLen : lineLen + 1 + wLen;
    if (candidate > maxChars && lineLen > 0) {
      lines++;
      lineLen = wLen;
    } else {
      lineLen = candidate;
    }
  }
  return lines;
}

function fitLabelFontSize(size: number, label: string): number {
  const base = size * 0.17;
  const floor = size * 0.09;
  const maxWidth = size * 0.8;
  for (let fs = base; fs > floor; fs -= 0.5) {
    if (estimatedLineCount(label, fs, maxWidth) <= LINE_BUDGET) return fs;
  }
  return floor;
}

interface Props {
  measurable: Measurable;
  size: number;
  center: Point;
  palette: Palette;
  canvasSize: { w: number; h: number };
  onTap: () => void;
  onTick: () => void;
  onDragStart?: () => void;
  onDragEnd: (center: Point) => void;
}

// One measurable bubble on the goal's canvas — same drag-and-settle shape as
// RadialBoard's DraggableBubble (Animated.ValueXY offset + PanResponder),
// plus a hold-to-tick gesture RadialBoard's goal bubbles don't need: a
// press that stays still past HOLD_MS ticks the measurable off (or, for a
// ladder, advances it to the next week) instead of opening it.
export function MeasurableBubble({
  measurable: m, size, center, palette: p, canvasSize, onTap, onTick, onDragStart, onDragEnd,
}: Props) {
  const pan = useRef(new Animated.ValueXY()).current;
  const { scale: popScale, pulse } = useCompletionPulse();
  const frac = measurableFraction(m);

  const centerRef = useRef(center);
  centerRef.current = center;
  const canvasSizeRef = useRef(canvasSize);
  canvasSizeRef.current = canvasSize;
  // The PanResponder below is created ONCE (useRef) so its handlers never
  // change identity across re-renders — meaning any callback prop used
  // directly inside it would be permanently frozen to whatever it was on
  // first mount. Every callback the responder calls is routed through a
  // ref updated on every render instead, so a hold/tap/drag always invokes
  // the latest version (and, transitively, acts on the latest `m`/`goal`).
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingRef = useRef(false);
  const holdFiredRef = useRef(false);

  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        draggingRef.current = false;
        holdFiredRef.current = false;
        clearHold();
        holdTimer.current = setTimeout(() => {
          if (draggingRef.current) return; // already turned into a drag
          holdFiredRef.current = true;
          pulse(true);
          onTickRef.current();
        }, HOLD_MS);
      },
      onPanResponderMove: (_evt, g) => {
        if (holdFiredRef.current) return;
        if (!draggingRef.current) {
          const dist = Math.hypot(g.dx, g.dy);
          if (dist > MOVE_THRESHOLD) {
            clearHold();
            draggingRef.current = true;
            onDragStartRef.current?.();
          } else {
            return;
          }
        }
        pan.setValue({ x: g.dx, y: g.dy });
      },
      onPanResponderRelease: (_evt, g) => {
        clearHold();
        if (draggingRef.current) {
          draggingRef.current = false;
          const raw: Point = {
            x: centerRef.current.x + g.dx,
            y: centerRef.current.y + g.dy,
          };
          const clamped = clampCenter(raw, size / 2, canvasSizeRef.current.w, canvasSizeRef.current.h);
          pan.setValue({ x: 0, y: 0 });
          onDragEndRef.current(clamped);
        } else if (holdFiredRef.current) {
          holdFiredRef.current = false;
        } else {
          onTapRef.current();
        }
      },
      onPanResponderTerminate: () => {
        clearHold();
        if (draggingRef.current) {
          draggingRef.current = false;
          pan.setValue({ x: 0, y: 0 });
          onDragEndRef.current(centerRef.current);
        }
        holdFiredRef.current = false;
      },
    }),
  ).current;

  const fillHeight = size * frac;

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.wrap,
        {
          left: center.x - size / 2,
          top: center.y - size / 2,
          width: size, height: size,
          transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale: popScale }],
        },
        // Without this, a mouse-drag over the label text starts a native
        // text selection instead of reaching the PanResponder — the drag
        // gesture never begins because the browser owns the pointer first.
        Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none' } as any) : undefined,
      ]}
    >
      <View
        style={[
          styles.circle,
          {
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: hexAlpha(p.accent, 0.16),
            borderColor: p.accent, borderWidth: 1.5, overflow: 'hidden',
          },
        ]}
      >
        <View
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: fillHeight, backgroundColor: hexAlpha(p.accent, 0.55),
          }}
        />
        <View style={styles.label}>
          <Text style={[styles.labelText, { color: p.text, fontSize: fitLabelFontSize(size, m.label) }]}>
            {m.label}
          </Text>
          {m.type === 'number' && (
            <Text style={[styles.subText, { color: p.muted, fontSize: size * 0.1 }]}>
              {formatNumber(m.current)}/{formatNumber(m.target)}
            </Text>
          )}
          {m.type === 'ladder' && (
            <Text style={[styles.subText, { color: p.muted, fontSize: size * 0.1 }]}>
              {m.weeks.filter((w) => w.done).length}/{m.weeks.length} wks
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// Applies a hold gesture's effect to a measurable: a checkbox toggles, a
// number ticks up by its own step (same increment its +/- stepper uses),
// and a ladder marks its next not-yet-done week done — "advances to the
// next value in the series" rather than a plain toggle.
export function tickMeasurable(m: Measurable): Measurable {
  switch (m.type) {
    case 'check':
      return { ...m, done: !m.done };
    case 'number':
      return { ...m, current: steppedValue(m, 1) };
    case 'ladder': {
      const idx = m.weeks.findIndex((w) => !w.done);
      if (idx === -1) return m;
      const weeks = m.weeks.map((w, i) => (i === idx ? { ...w, done: true } : w));
      return { ...m, weeks };
    }
  }
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  circle: { alignItems: 'center', justifyContent: 'center' },
  label: { alignItems: 'center', paddingHorizontal: 4, zIndex: 1 },
  labelText: { fontWeight: '700', textAlign: 'center' },
  subText: { textAlign: 'center', marginTop: 2 },
});
