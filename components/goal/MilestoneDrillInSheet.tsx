import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Commitment, Measurable, Goal, Cadence, StepSchedule } from '../../store/models';
import { Palette } from '../../theme/themes';
import { MeasurableCard } from './MeasurableCard';
import { AddMeasurableForm } from './AddMeasurableForm';
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
  // Adds a brand-new tracking item under `milestone` — separate from
  // onUpdateItem, which only ever patches an item already in goal.items.
  onAddMeasurable: (m: Measurable) => void;
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

// What tapping a bubble on the goal canvas opens, and the only place a
// Milestone's tracking is added or edited — there is no separate tab for
// it. Renders the Milestone's own card, then every one of its children's
// (its tracking items), each fully interactive: tick, edit, and set a
// reminder, plus an "Add tracking"/"Add another" affordance at the bottom
// for adding more without leaving this sheet.
export function MilestoneDrillInSheet({
  milestone, goal, goalTargetDate, palette: p, noteColor,
  onUpdateItem, onDeleteItem, onAddMeasurable, onDismiss,
  onOpenSchedule, onOpenCommitmentSchedule, onAskCoach,
  scheduleStep, onSaveSchedule, onTurnOffSchedule, onCloseSchedule,
}: Props) {
  const children = milestone
    ? goal.items.filter((it) => it.parentId === milestone.id)
    : [];
  // Resets whenever a different milestone is opened (or the sheet closes),
  // rather than staying open across milestones.
  const [addingTracking, setAddingTracking] = useState(false);
  React.useEffect(() => { setAddingTracking(false); }, [milestone?.id]);

  return (
    <Modal visible={!!milestone} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { backgroundColor: p.bg }]}
          onPress={(e) => e.stopPropagation?.()}
        >
          {/* Hidden (not unmounted — see below) rather than removed while a
              schedule is being edited: this header's own close button would
              dismiss the WHOLE drill-in, which isn't what the schedule
              overlay's own close button (inside StepScheduleContent) should
              do. `display: none` keeps it out of layout without touching
              the mounted subtree beneath it. */}
          <View style={[styles.header, scheduleStep ? styles.hidden : undefined]}>
            <Text style={[styles.title, { color: p.text }]} numberOfLines={2}>
              {milestone?.label ?? ''}
            </Text>
            <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color={p.muted} />
            </TouchableOpacity>
          </View>

          {/* `display: none` rather than conditionally rendering — this
              stays mounted (not unmounted) while the schedule overlay below
              is showing, so its scroll position and every MeasurableCard's
              own commitmentsOpen accordion / in-progress commitment draft
              survive a schedule edit instead of being reset. Deliberately
              NOT position:'absolute' with the schedule content on top of
              it (an earlier version of this fix used that): an absolutely
              positioned child doesn't grow its parent, so on a short
              milestone the sheet stayed sized to the (now-hidden) list
              while the schedule form rendered ~400px below the visible
              card, over bare canvas — dead space on iOS, where UIKit's
              hitTest returns nil outside the superview's actual bounds. A
              plain display-toggled sibling has no such box-model mismatch:
              only one of the two is ever part of layout at a time, so the
              sheet always sizes to whichever is actually showing. */}
          {milestone && (
            <ScrollView style={[{ maxHeight: 520 }, scheduleStep ? styles.hidden : undefined]}>
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
                <Text style={[styles.eyebrow, { color: p.muted }]}>TRACKING</Text>
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

              {children.length === 0 && !addingTracking && (
                <Text style={[styles.emptyHint, { color: p.muted }]}>
                  Nothing tracked yet — add how you'll measure this below, or ask the Coach.
                </Text>
              )}

              {addingTracking ? (
                <AddMeasurableForm
                  palette={p}
                  goalTargetDate={goalTargetDate}
                  milestoneId={milestone!.id}
                  onAdd={(m) => { onAddMeasurable(m); setAddingTracking(false); }}
                />
              ) : (
                <TouchableOpacity
                  style={[styles.addTrackingBtn, { borderColor: p.line }]}
                  onPress={() => setAddingTracking(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Add tracking to this milestone"
                >
                  <Ionicons name="add" size={16} color={p.text} />
                  <Text style={[styles.addTrackingText, { color: p.text }]}>
                    {children.length === 0 ? 'Add tracking' : 'Add another'}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}

          {/* Inline schedule editor — a NORMAL sibling, not an overlay, so
              the sheet's height comes from whichever of this or the list
              above is actually laid out (display:none above takes the list
              out of flow while this is showing). See scheduleStep's doc
              comment for why this is never a second Modal. */}
          {scheduleStep && (
            <KeyboardAvoidingView
              style={{ width: '100%' }}
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
  addTrackingBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 12,
    paddingVertical: 12, marginTop: 10,
  },
  addTrackingText: { fontSize: 13, fontWeight: '600' },
  hidden: { display: 'none' },
});
