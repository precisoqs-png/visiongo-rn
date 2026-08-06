import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Palette } from '../../theme/themes';

interface Segment<T extends string> {
  key: T;
  label: string;
}

interface Props<T extends string> {
  segments: Segment<T>[];
  // Omit when the segments are separate destinations rather than two states
  // of the same view (e.g. two nav buttons) — no segment gets the filled
  // "active" treatment then, so it doesn't read as an already-made choice.
  value?: T;
  onChange: (value: T) => void;
  palette: Palette;
}

// The pill toggle the board uses for "Whole Year / By Month" — pulled out
// so other screens get the exact same look and behavior instead of a
// re-styled copy. With `value` set it's a real toggle (one segment filled
// and highlighted); without it, it's two neutral, equally-weighted buttons
// separated by a divider instead.
export function SegmentedControl<T extends string>({ segments, value, onChange, palette: p }: Props<T>) {
  const neutral = value === undefined;
  return (
    <View
      style={[
        styles.segmented,
        neutral
          ? { backgroundColor: p.surface, borderWidth: 1, borderColor: p.line, padding: 0, gap: 0 }
          : { backgroundColor: p.line },
      ]}
    >
      {segments.map((seg, i) => {
        const active = !neutral && value === seg.key;
        return (
          <TouchableOpacity
            key={seg.key}
            style={[
              styles.segBtn,
              active && { backgroundColor: p.ink },
              neutral && i > 0 && { borderLeftWidth: 1, borderLeftColor: p.line },
              neutral && { borderRadius: 0 },
            ]}
            onPress={() => onChange(seg.key)}
          >
            <Text
              style={[
                styles.segText,
                { color: active ? (p.isDark ? p.bg : '#fff') : neutral ? p.text : p.muted },
              ]}
            >
              {seg.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: {
    flexDirection: 'row', borderRadius: 20, padding: 3, gap: 2,
  },
  segBtn: { flex: 1, paddingVertical: 7, paddingHorizontal: 16, borderRadius: 16, alignItems: 'center' },
  segText: { fontSize: 13, fontWeight: '500' },
});
