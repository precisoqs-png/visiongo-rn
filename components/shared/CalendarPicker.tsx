import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Palette, FONTS } from '../../theme/themes';

interface Props {
  visible: boolean;
  /** Currently selected date as 'YYYY-MM-DD', or undefined. */
  value?: string;
  palette: Palette;
  onSelect: (isoDate: string) => void;
  onClear?: () => void;
  onDismiss: () => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseISO(iso?: string): { y: number; m: number; d: number } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y, m: m - 1, d };
}

export function CalendarPicker({ visible, value, palette: p, onSelect, onClear, onDismiss }: Props) {
  const today = new Date();
  const selected = parseISO(value);

  const [viewYear, setViewYear] = useState(selected?.y ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.m ?? today.getMonth());

  // Re-center on the selected (or current) month whenever the picker opens
  useEffect(() => {
    if (visible) {
      const sel = parseISO(value);
      setViewYear(sel?.y ?? today.getFullYear());
      setViewMonth(sel?.m ?? today.getMonth());
    }
  }, [visible]);

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
  const isSelected = (d: number) =>
    !!selected && d === selected.d && viewMonth === selected.m && viewYear === selected.y;
  // Every use of this picker (onboarding, a goal's "Achieve by", a
  // Milestone's deadline) is a future target — a past date is never valid,
  // and picking one silently used to land the user in an all-red Overdue
  // list on first run.
  const isPast = (d: number) => {
    const cell = new Date(viewYear, viewMonth, d);
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return cell < startOfToday;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity activeOpacity={1} style={[styles.card, { backgroundColor: p.surface }]}>
          <Text style={[styles.eyebrow, { color: p.muted }]}>ACHIEVE BY</Text>

          <View style={styles.headerRow}>
            <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={20} color={p.text} />
            </TouchableOpacity>
            <Text style={[styles.monthLabel, { color: p.text, fontFamily: FONTS.display }]}>
              {MONTHS[viewMonth]} {viewYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-forward" size={20} color={p.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={[styles.weekday, { color: p.muted }]}>{w}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((d, i) => (
              <View key={i} style={styles.cell}>
                {d != null && (
                  <TouchableOpacity
                    disabled={isPast(d)}
                    style={[
                      styles.dayBtn,
                      isToday(d) && { borderWidth: 1, borderColor: p.accent },
                      isSelected(d) && { backgroundColor: p.accent },
                    ]}
                    onPress={() => onSelect(toISO(viewYear, viewMonth, d))}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        { color: isSelected(d) ? p.surface : isPast(d) ? `${p.muted}66` : p.text },
                      ]}
                    >
                      {d}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            {onClear && !!value && (
              <TouchableOpacity onPress={onClear}>
                <Text style={{ color: '#c0392b', fontSize: 15 }}>Clear</Text>
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={onDismiss}>
              <Text style={{ color: p.muted, fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: { width: '100%', maxWidth: 360, borderRadius: 18, padding: 18 },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 10 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  monthLabel: { fontSize: 17, fontWeight: '700' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  dayBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  dayText: { fontSize: 14, fontWeight: '500' },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 18 },
});
