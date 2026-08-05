import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Palette } from '../../theme/themes';

interface Segment<T extends string> {
  key: T;
  label: string;
}

interface Props<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  palette: Palette;
}

// The pill toggle the board uses for "Whole Year / By Month" — pulled out
// so other screens (the goal canvas's Measurables/Milestones toggle) get
// the exact same look and behavior instead of a re-styled copy.
export function SegmentedControl<T extends string>({ segments, value, onChange, palette: p }: Props<T>) {
  return (
    <View style={[styles.segmented, { backgroundColor: p.line }]}>
      {segments.map((seg) => (
        <TouchableOpacity
          key={seg.key}
          style={[styles.segBtn, value === seg.key && { backgroundColor: p.ink }]}
          onPress={() => onChange(seg.key)}
        >
          <Text
            style={[
              styles.segText,
              { color: value === seg.key ? (p.isDark ? p.bg : '#fff') : p.muted },
            ]}
          >
            {seg.label}
          </Text>
        </TouchableOpacity>
      ))}
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
