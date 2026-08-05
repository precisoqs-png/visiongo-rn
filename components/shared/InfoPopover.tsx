import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Palette } from '../../theme/themes';

interface Props {
  palette: Palette;
  title: string;
  body: string;
}

// A small "i" button that opens a short explainer card — same
// backdrop/card/close pattern as StepScheduleSheet, so it reads as part of
// the same UI language rather than a one-off popover.
export function InfoPopover({ palette: p, title, body }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel={`About ${title}`}
        style={styles.trigger}
      >
        <Ionicons name="information-circle-outline" size={15} color={p.muted} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setVisible(false)}>
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.card, { backgroundColor: p.bg }]}
            onPress={(e) => e.stopPropagation?.()}
          >
            <View style={styles.header}>
              <Text style={[styles.title, { color: p.text }]}>{title}</Text>
              <TouchableOpacity onPress={() => setVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={18} color={p.muted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.body, { color: p.muted }]}>{body}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { marginLeft: 4 },
  backdrop: {
    flex: 1, backgroundColor: '#00000070',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  card: { width: '100%', maxWidth: 380, borderRadius: 16, padding: 16 },
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', gap: 10, marginBottom: 8,
  },
  title: { fontSize: 15, fontWeight: '700', flex: 1 },
  body: { fontSize: 13, lineHeight: 19 },
});
