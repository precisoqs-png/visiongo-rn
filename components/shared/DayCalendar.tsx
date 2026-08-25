import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Palette, FONTS } from '../../theme/themes';

interface Props {
  /** Marked days as 'YYYY-MM-DD'. */
  markedDates: string[];
  palette: Palette;
  /** The goal/note color a marked day fills with — matches the measurable's own bubble color. */
  color: string;
  onToggleDay: (iso: string) => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Inline (no Modal — never presented over an already-open sheet) month
// grid where tapping a day toggles it marked/unmarked, for a Number
// measurable tracked by WHICH days it happened rather than a running
// count. Only today and past days are selectable — marking a day that
// hasn't happened yet doesn't mean anything for this kind of measurable.
export function DayCalendar({ markedDates, palette: p, color, onToggleDay }: Props) {
  const today = new Date();
  const marked = new Set(markedDates);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const isToday = (d: number) =>
    d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
  const isFuture = (d: number) => new Date(viewYear, viewMonth, d) > today;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={18} color={p.text} />
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: p.text, fontFamily: FONTS.display }]}>
          {MONTHS[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-forward" size={18} color={p.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={[styles.weekday, { color: p.muted }]}>{w}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (d == null) return <View key={i} style={styles.cell} />;
          const iso = toISO(viewYear, viewMonth, d);
          const isMarked = marked.has(iso);
          const disabled = isFuture(d);
          return (
            <View key={i} style={styles.cell}>
              <TouchableOpacity
                disabled={disabled}
                onPress={() => onToggleDay(iso)}
                style={[
                  styles.dayBtn,
                  isMarked && { backgroundColor: color },
                  isToday(d) && !isMarked && { borderWidth: 1, borderColor: color },
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    { color: isMarked ? '#fff' : disabled ? `${p.muted}66` : p.text },
                  ]}
                >
                  {d}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <Text style={[styles.hint, { color: p.muted }]}>
        Tap a day to mark it done. {markedDates.length} marked total.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 12, marginTop: 4 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  monthLabel: { fontSize: 15, fontWeight: '700' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  dayBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  dayText: { fontSize: 12, fontWeight: '500' },
  hint: { fontSize: 11, marginTop: 8, textAlign: 'center' },
});
