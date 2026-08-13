import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  Animated, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Goal, ChatMessage, describeAction, newId } from '../../store/models';
import { Palette } from '../../theme/themes';
import { coachService, CoachConfigError, CoachGoalContext, CoachMessageRaw } from '../../services/coachService';
import { useAppStore, COACH_DAILY_LIMIT } from '../../store/useAppStore';

interface Props {
  goal: Goal;
  palette: Palette;
  // Called after the store changed, so the screen can re-sync reminders.
  onGoalEdited?: () => void;
  // A message handed over from elsewhere on the screen (the "Ask coach" button
  // on an effort milestone). Sent once, then cleared via onSeedConsumed.
  seedMessage?: string | null;
  onSeedConsumed?: () => void;
  // The host screen's own ScrollView carries the chat (this component is
  // just a View of bubbles) — asking it to scroll to bottom is the only way
  // a new reply, a finished typewriter, or fresh pendingActions chips ever
  // become visible under the 58%-height keyboard-up coach sheet.
  onRequestScrollToEnd?: () => void;
  // Whether that ScrollView is currently scrolled near its own bottom —
  // read (not subscribed to) at the moment a reply/typewriter/pendingActions
  // update lands, so a user actively reading earlier history never gets
  // yanked away by content arriving below them. The user's OWN just-sent
  // message always scrolls regardless, same as any chat app.
  isNearBottom?: () => boolean;
  // Autofocus the composer on mount. Defaults to false: on milestones.tsx
  // and measurables.tsx the composer is the LAST element of the whole-page
  // ScrollView, so focusing it triggers RN-web's scroll-into-view and the
  // native keyboard's layout inset — both silently re-scroll straight to
  // the bottom, reproducing the exact yank auto-scroll's mount guard was
  // written to prevent, just via a different path. Only the canvas's coach
  // MODAL (index.tsx) — a short sheet, not the whole page — passes true.
  autoFocusInput?: boolean;
}

// ── Pulsing thinking dots ────────────────────────────────────

function ThinkingDots({ color }: { color: string }) {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 280, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.2, duration: 280, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7, height: 7, borderRadius: 3.5,
            backgroundColor: color,
            opacity: dot,
            transform: [{
              translateY: dot.interpolate({ inputRange: [0.2, 1], outputRange: [0, -4] }),
            }],
          }}
        />
      ))}
    </View>
  );
}

// ── Typewriter text — streams word by word ────────────────────

interface TypewriterProps {
  text: string;
  color: string;
  speed?: number;
  onDone?: () => void;
}

function TypewriterText({ text, color, speed = 30, onDone }: TypewriterProps) {
  const [displayed, setDisplayed] = useState('');
  const doneRef = useRef(false);

  useEffect(() => {
    doneRef.current = false;
    setDisplayed('');
    const words = text.split(' ');
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(words.slice(0, i).join(' '));
      if (i >= words.length) {
        clearInterval(id);
        if (!doneRef.current) {
          doneRef.current = true;
          onDone?.();
        }
      }
    }, speed);
    return () => clearInterval(id);
  }, [text]);

  return (
    <Text style={[styles.bubbleText, { color }]}>{displayed || ' '}</Text>
  );
}

// ── Main chat component ──────────────────────────────────

export function CoachChat({
  goal, palette: p, onGoalEdited, seedMessage, onSeedConsumed, onRequestScrollToEnd, isNearBottom,
  autoFocusInput = false,
}: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [streamingId, setStreamingId] = useState<string | null>(null);
  // Set on any bubble that came back from the offline stub instead of the
  // real coach, so a network/config/parsing failure never reads as a
  // genuine answer.
  const [stubMessageIds, setStubMessageIds] = useState<Set<string>>(new Set());

  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const addPendingActions = useAppStore((s) => s.addPendingActions);
  const applyPendingAction = useAppStore((s) => s.applyPendingAction);
  const applyAllPendingActions = useAppStore((s) => s.applyAllPendingActions);
  const dismissPendingAction = useAppStore((s) => s.dismissPendingAction);
  const clearPendingActions = useAppStore((s) => s.clearPendingActions);
  const incrementCoachUsage = useAppStore((s) => s.incrementCoachUsage);
  const coachUsage = useAppStore((s) => s.coachUsage);

  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!autoFocusInput) return;
    const t = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll the host's ScrollView to the bottom on the next frame — deferred
  // so it runs after the just-appended bubble/chips have actually laid out,
  // not against the ScrollView's pre-append content height.
  const scrollToEnd = () => {
    requestAnimationFrame(() => onRequestScrollToEnd?.());
  };

  // Scroll only when it won't yank the user away from something they're
  // reading: always for their own just-sent message (last bubble is
  // 'user'), otherwise only if they're already near the bottom.
  const scrollToEndIfWanted = () => {
    const lastSender = goal.chat[goal.chat.length - 1]?.sender;
    if (lastSender === 'user' || (isNearBottom?.() ?? true)) scrollToEnd();
  };

  // On milestones.tsx the "host ScrollView" is the WHOLE
  // goal screen, not just the chat — so the very first render (mount) must
  // never auto-scroll, or simply opening those screens yanks straight past
  // the header and every card down to the coach input. Each effect below
  // gets its OWN mount guard rather than a shared one — both fire in the
  // same mount commit, so a single shared ref would already read "mounted"
  // by the time the second effect's mount-time run checked it.
  const didMountChatRef = useRef(false);
  const didMountPendingRef = useRef(false);

  // A new message (either side) always means new content below the fold.
  const chatLength = goal.chat.length;
  useEffect(() => {
    if (!didMountChatRef.current) { didMountChatRef.current = true; return; }
    scrollToEndIfWanted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatLength]);

  // The coach's confirmation chips are the whole point of a reply — they
  // must never render invisibly below the fold, but only when the user is
  // already there; someone scrolled up reading history shouldn't be
  // yanked down just because a chip appeared.
  const pendingCount = goal.pendingActions.length;
  useEffect(() => {
    if (!didMountPendingRef.current) { didMountPendingRef.current = true; return; }
    if (pendingCount > 0) scrollToEndIfWanted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCount]);

  // Derive today's remaining count reactively so the UI updates without a send
  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const usedToday = coachUsage.date === todayKey ? coachUsage.count : 0;
  const limitReached = usedToday >= COACH_DAILY_LIMIT;

  const sendText = async (raw: string) => {
    const text = raw.trim();
    if (!text || loading || limitReached) return;

    setError('');

    const userMsg: ChatMessage = {
      id: newId(), sender: 'user', text, timestamp: new Date().toISOString(),
    };
    addChatMessage(userMsg, goal.id);
    setLoading(true);

    const weeksLeft = goal.targetDate
      ? Math.max(0, Math.round((new Date(goal.targetDate).getTime() - Date.now()) / (7 * 86400000)))
      : undefined;

    const ctx: CoachGoalContext = {
      goalTitle: goal.title,
      achieveByDate: goal.targetDate,
      weeksRemaining: weeksLeft,
      today: new Date(),
      measurables: goal.items.filter((it) => it.parentId != null),
      milestones: goal.items.filter((it) => it.milestone),
      exchangeCount: goal.chat.filter((m) => m.sender === 'coach').length,
      motivation: goal.motivation,
    };

    const history: CoachMessageRaw[] = [
      ...goal.chat.map((m) => ({
        role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
        text: m.text,
      })),
      { role: 'user' as const, text },
    ];

    try {
      const response = await coachService.send(history, ctx);
      const msgId = newId();
      const coachMsg: ChatMessage = {
        id: msgId, sender: 'coach', text: response.text, timestamp: new Date().toISOString(),
      };
      addChatMessage(coachMsg, goal.id);
      setStreamingId(msgId);
      addPendingActions(response.actions, goal.id);
      if (response.stub) {
        // A stub reply is not a failure the user needs to retry — it's a
        // usable (if generic) plan — but it must never be mistaken for a
        // real coach answer, so flag the bubble instead of the allowance.
        setStubMessageIds((prev) => new Set(prev).add(msgId));
      } else {
        // Only a confirmed real response counts against the daily
        // allowance — a failed, cancelled, misconfigured, or stubbed
        // request must not burn it.
        incrementCoachUsage();
      }
    } catch (err) {
      if (err instanceof CoachConfigError) {
        setError('Coach isn’t set up for this build yet. Nothing was sent — try again later.');
      } else if (err instanceof Error && (err as { isRateLimit?: boolean }).isRateLimit) {
        setError(err.message);
      } else if (err instanceof Error && err.name === 'AbortError') {
        setError('That took too long. Try again.');
      } else {
        setError('Coach is unavailable right now. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // The composer's own send. Kept argument-free so onPress's gesture event
  // can never be mistaken for message text.
  const sendMessage = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    void sendText(text);
  };

  // "Ask coach" on an effort milestone seeds a message from outside the
  // composer; send it once, guarding against the re-render that clears it.
  const seedSentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!seedMessage || loading) return;
    if (seedSentRef.current === seedMessage) return;
    seedSentRef.current = seedMessage;
    onSeedConsumed?.();
    void sendText(seedMessage);
  }, [seedMessage, loading]);

  return (
    <View>
      <Text style={[styles.eyebrow, { color: p.muted }]}>AI COACH</Text>

      {goal.chat.length === 0 && !loading && (
        <View style={[styles.emptyCard, { backgroundColor: p.surface }]}>
          <Text style={[styles.emptyText, { color: p.muted }]}>
            Your AI coach is here to help turn "{goal.title}" into an action plan.
            Ask anything to get started!
          </Text>
        </View>
      )}

      {goal.chat.map((msg) => {
        const isUser = msg.sender === 'user';
        const isStreaming = msg.id === streamingId;
        const isStub = stubMessageIds.has(msg.id);
        const textColor = isUser ? p.surface : p.text;

        return (
          <View key={msg.id}>
            {isStub && (
              <View style={[styles.stubBanner, { backgroundColor: `${p.muted}22` }]}>
                <Ionicons name="alert-circle-outline" size={12} color={p.muted} />
                <Text style={[styles.stubBannerText, { color: p.muted }]}>
                  Coach unavailable — showing a basic plan
                </Text>
              </View>
            )}
            <View
              style={[
                styles.bubble,
                isUser
                  ? [styles.userBubble, { backgroundColor: p.accent }]
                  : [styles.coachBubble, { backgroundColor: p.surface }],
              ]}
            >
              {isStreaming ? (
                <TypewriterText
                  text={msg.text}
                  color={textColor}
                  speed={30}
                  onDone={() => {
                    setStreamingId(null);
                    scrollToEndIfWanted();
                  }}
                />
              ) : (
                <Text style={[styles.bubbleText, { color: textColor }]}>{msg.text}</Text>
              )}
            </View>
          </View>
        );
      })}

      {loading && (
        <View style={[styles.coachBubble, styles.bubble, { backgroundColor: p.surface }]}>
          <ThinkingDots color={p.muted} />
        </View>
      )}

      {/* Changes the coach wants to make to this goal. Nothing is written
          until the user taps a chip (one change) or Add all. */}
      {goal.pendingActions.length > 0 && (
        <View style={[styles.actionsCard, { backgroundColor: p.surface, borderColor: `${p.accent}55` }]}>
          <View style={styles.actionsHeader}>
            <Ionicons name="sparkles-outline" size={14} color={p.accent} />
            <Text style={[styles.actionsTitle, { color: p.text }]}>
              {goal.pendingActions.length === 1
                ? 'Your coach suggests 1 change'
                : `Your coach suggests ${goal.pendingActions.length} changes`}
            </Text>
          </View>
          <Text style={[styles.actionsHint, { color: p.muted }]}>
            Tap one to apply it to your goal.
          </Text>

          {goal.pendingActions.map((pa) => (
            <View key={pa.id} style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionChip, { borderColor: `${p.accent}80` }]}
                onPress={() => {
                  applyPendingAction(pa.id, goal.id);
                  onGoalEdited?.();
                }}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={ACTION_ICONS[pa.action.kind]}
                  size={13}
                  color={pa.action.kind === 'removeTask' ? '#c0392b' : p.accent}
                />
                <Text
                  style={[
                    styles.actionText,
                    { color: pa.action.kind === 'removeTask' ? '#c0392b' : p.accent },
                  ]}
                >
                  {describeAction(pa.action, goal)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => dismissPendingAction(pa.id, goal.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={14} color={p.muted} />
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.actionsFooter}>
            <TouchableOpacity
              style={[styles.applyAllBtn, { backgroundColor: p.accent }]}
              onPress={() => {
                applyAllPendingActions(goal.id);
                onGoalEdited?.();
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.applyAllText, { color: p.surface }]}>
                {goal.pendingActions.length === 1 ? 'Apply' : 'Apply all'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => clearPendingActions(goal.id)}>
              <Text style={[styles.dismissAllText, { color: p.muted }]}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!!error && (
        <Text style={[styles.errorText, { color: '#c0392b' }]}>{error}</Text>
      )}

      {limitReached ? (
        <View style={[styles.limitBanner, { backgroundColor: p.surface }]}>
          <Ionicons name="time-outline" size={16} color={p.muted} style={{ marginRight: 8 }} />
          <Text style={[styles.limitText, { color: p.muted }]}>
            You've reached today's coaching limit — check back tomorrow!
          </Text>
        </View>
      ) : (
        <View style={[styles.inputRow, { backgroundColor: p.surface }]}>
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: p.text }]}
            placeholder="Message your coach…"
            placeholderTextColor={p.muted}
            value={input}
            onChangeText={setInput}
            multiline
            returnKeyType="send"
            onSubmitEditing={sendMessage}
            autoFocus={autoFocusInput && Platform.OS !== 'web'}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: input.trim() && !loading ? p.accent : p.line },
            ]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-up" size={16} color={p.surface} />
          </TouchableOpacity>
        </View>
      )}

      {!limitReached && usedToday > 0 && (
        <Text style={[styles.usageHint, { color: p.muted }]}>
          {COACH_DAILY_LIMIT - usedToday} of {COACH_DAILY_LIMIT} coaching messages remaining today
        </Text>
      )}
    </View>
  );
}

const ACTION_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  addTask: 'add-circle-outline',
  editTask: 'create-outline',
  removeTask: 'trash-outline',
  setTarget: 'flag-outline',
};

const styles = StyleSheet.create({
  actionsCard: {
    borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 4, marginBottom: 8,
  },
  actionsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionsTitle: { fontSize: 13, fontWeight: '700' },
  actionsHint: { fontSize: 12, marginTop: 2, marginBottom: 10 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  actionChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1, borderStyle: 'dashed',
  },
  actionText: { fontSize: 13, fontWeight: '500', flex: 1 },
  actionsFooter: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 2 },
  applyAllBtn: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 18 },
  applyAllText: { fontSize: 13, fontWeight: '700' },
  dismissAllText: { fontSize: 13, fontWeight: '500' },
  eyebrow: {
    fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 10,
  },
  emptyCard: { borderRadius: 14, padding: 16, marginBottom: 10 },
  emptyText: { fontSize: 14, lineHeight: 20 },
  bubble: {
    maxWidth: '82%', marginBottom: 8, borderRadius: 16, padding: 12,
  },
  coachBubble: { alignSelf: 'flex-start' },
  userBubble: { alignSelf: 'flex-end' },
  stubBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', marginBottom: 4, paddingHorizontal: 2,
  },
  stubBannerText: { fontSize: 11, fontWeight: '500' },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  errorText: { fontSize: 13, marginBottom: 8 },
  limitBanner: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, padding: 14, marginTop: 8,
  },
  limitText: { fontSize: 14, flex: 1, lineHeight: 20 },
  usageHint: { fontSize: 11, marginTop: 6, textAlign: 'right' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 22,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    marginTop: 8,
    gap: 8,
  },
  input: { flex: 1, fontSize: 14, maxHeight: 80, paddingVertical: 4 },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
});
