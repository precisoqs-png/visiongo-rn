import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Commitment, Measurable, Goal, Cadence, StepSchedule } from '../../store/models';
import { Palette } from '../../theme/themes';
import { MeasurableCard } from './MeasurableCard';
import { StepScheduleContent, ReminderTarget } from './StepScheduleSheet';

interface Props {
  // The top-level Milestone bubble that was tapped — null closes the sheet.
  milestone: Measurable | null;
  goal: Goal;
  goalTargetDate?: string;
  palette: Palette;
  noteColor: string;
  onUpdateItem: (m: Measurable) => void;
  onDeleteItem: (id: string) => void;
  onDismiss: () => void;
  // Threaded straight into every MeasurableCard rendered here — the
  // Milestone's own row AND each child Measurable's row — so every one of
  // them gets its own reminder bell, not just the top one. These just
  // report WHICH target the user wants to schedule; the caller decides
  // what to do with it (see scheduleStep below).
  onOpenSchedule: (m: Measurable) => void;
  onOpenCommitmentSchedule: (m: Measurable, step: Commitment) => void;
  onAskCoach?: (m: Measurable) => void;
  // The reminder target currently being edited (an item's own schedule, or
  // one Commitment's), or null when no schedule editor is open. Rendered
  // INLINE as an overlay within this same, already-open Modal — never as a
  // second Modal. Two RN Modals visible at once (this sheet, plus a
  // separately-presented StepScheduleSheet) is what caused the reported
  // goal-canvas freeze: on iOS, presenting a second modal view controller
  // from a screen already presenting one desyncs RN's internal "am I
  // presented" bookkeeping from UIKit's real state, leaving a transparent,
  // fully unresponsive screen that eats every touch. Keeping the schedule
  // editor as a plain overlay inside this sheet's own Modal — rather than
  // closing this sheet and opening a second one — also means the
  // ScrollView position, MeasurableCard's commitmentsOpen accordion state,
  // and CommitmentsBlock's in-progress new-commitment draft all survive a
  // schedule edit instead of being reset by an unmount.
  scheduleStep: ReminderTarget | null;
  onSaveSchedule: (patch: { cadence: Cadence; intervalDays?: number; schedule: StepSchedule }) => void;
  onTurnOffSchedule: () => void;
  onCloseSchedule: () => void;
}

// What tapping a bubble on the goal canvas opens. A top-level Milestone
// bubble is a container — MeasurableDetailSheet (the old sheet this
// replaces) only ever rendered the Milestone's OWN row, so its child
// Measurables — the actual numbers, build-up weeks, and commitments the
// user needs to tick off on the way to 100% — were completely invisible
// once opened from the canvas. This renders the Milestone's own card, then
// every one of its children's, each fully interactive: tick, edit, and set
// a reminder, same as the Measurables tab list gives them.
export function MilestoneDrillInSheet({
  milestone, goal, goalTargetDate, palette: p, noteColor,
  onUpdateItem, onDeleteItem, onDismiss,
  onOpenSchedule, onOpenCommitmentSchedule, onAskCoach,
  scheduleStep, onSaveSchedule, onTurnOffSchedule, onCloseSchedule,
}: Props) {
  const children = milestone
    ? goal.items.filter((it) => it.parentId === milestone.id)
    : [];

  return (
    <Modal visible={!!milestone} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { backgroundColor: p.bg }]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: p.text }]} numberOfLines={2}>
              {milestone?.label ?? ''}
            </Text>
            <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color={p.muted} />
            </TouchableOpacity>
          </View>

          {milestone && (
            <ScrollView style={{ maxHeight: 520 }}>
              <MeasurableCard
                measurable={milestone}
                goal={goal}
                goalTargetDate={goalTargetDate}
                palette={p}
                noteColor={noteColor}
                onUpdate={onUpdateItem}
                onDelete={(mid) => { onDeleteItem(mid); onDismiss(); }}
                onOpenSchedule={onOpenSchedule}
                onOpenCommitmentSchedule={onOpenCommitmentSchedule}
                onAskCoach={onAskCoach}
              />

              {children.length > 0 && (
                <Text style={[styles.eyebrow, { color: p.muted }]}>MEASURABLES</Text>
              )}
              {children.map((child) => (
                <MeasurableCard
                  key={child.id}
                  measurable={child}
                  goal={goal}
                  goalTargetDate={goalTargetDate}
                  palette={p}
                  noteColor={noteColor}
                  onUpdate={onUpdateItem}
                  onDelete={onDeleteItem}
                  onOpenSchedule={onOpenSchedule}
                  onOpenCommitmentSchedule={onOpenCommitmentSchedule}
                  onAskCoach={onAskCoach}
                />
              ))}

              {children.length === 0 && (
                <Text style={[styles.emptyHint, { color: p.muted }]}>
                  No measurables under this milestone yet — add one from the
                  Measurables tab, or ask the Coach.
                </Text>
              )}
            </ScrollView>
          )}

          {/* Inline schedule editor overlay — see scheduleStep's doc comment
              above for why this is never a second Modal. The list above
              stays mounted underneath (just visually covered), so its
              scroll position and every card's own open/draft state survive
              closing this overlay. */}
          {scheduleStep && (
            <View style={[styles.scheduleOverlay, { backgroundColor: p.bg }]}>
              <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              >
                <StepScheduleContent
                  step={scheduleStep}
                  palette={p}
                  onSave={onSaveSchedule}
                  onTurnOff={onTurnOffSchedule}
                  onDismiss={onCloseSchedule}
                />
              </KeyboardAvoidingView>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: '#00000070',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  sheet: { width: '100%', maxWidth: 460, borderRadius: 20, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 4 },
  title: { flex: 1, fontSize: 16, fontWeight: '700' },
  eyebrow: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1.5,
    marginTop: 14, marginBottom: 6,
  },
  emptyHint: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  // Covers the sheet's own content box (relative to the padded parent, so
  // it lines up with the header/list it's replacing without needing to
  // account for the parent's padding itself).
  scheduleOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 20 },
});
