import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store/useAppStore';

interface Props {
  goalId: string | null;
  goalTitle: string;
  visible: boolean;
  onDismiss: () => void;
  palette: any;
}

export function GoalActionSheet({ goalId, goalTitle, visible, onDismiss, palette }: Props) {
  const p = palette;
  const router = useRouter();
  const deleteGoal = useAppStore((s) => s.deleteGoal);

  const handleOpen = () => {
    onDismiss();
    if (goalId) router.push(`/goal/${goalId}`);
  };

  const confirmDelete = () => {
    if (!goalId) return;
    deleteGoal(goalId);
    onDismiss();
  };

  const handleDelete = () => {
    if (!goalId) return;
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${goalTitle}"? This cannot be undone.`)) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        'Delete Goal',
        `Delete "${goalTitle}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: confirmDelete },
        ],
      );
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.scrim} activeOpacity={1} onPress={onDismiss} />
      <View style={[styles.sheet, { backgroundColor: p.surface }]}>
        <View style={[styles.handle, { backgroundColor: p.line }]} />
        <Text style={[styles.sheetTitle, { color: p.text }]} numberOfLines={2}>
          {goalTitle}
        </Text>

        <TouchableOpacity
          style={[styles.row, { borderColor: p.line }]}
          onPress={handleOpen}
        >
          <Ionicons name="arrow-forward-circle-outline" size={22} color={p.text} />
          <Text style={[styles.rowText, { color: p.text }]}>Open goal</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.row, styles.deleteRow, { borderColor: '#c0392b33' }]}
          onPress={handleDelete}
        >
          <Ionicons name="trash-outline" size={22} color="#c0392b" />
          <Text style={[styles.rowText, { color: '#c0392b' }]}>Delete goal</Text>
        </TouchableOpacity>

        <View style={{ height: Platform.OS === 'ios' ? 24 : 12 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    ...(Platform.OS === 'web' ? { maxWidth: 480, alignSelf: 'center', width: '100%' } : {}),
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 16,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 10,
  },
  deleteRow: { backgroundColor: '#c0392b0a' },
  rowText: { fontSize: 16, fontWeight: '500', flex: 1 },
});
