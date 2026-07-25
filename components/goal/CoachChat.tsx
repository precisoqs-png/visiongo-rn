import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  Animated, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Goal, ChatMessage, Suggestion, newId } from '../../store/models';
import { Palette } from '../../theme/themes';
import { coachService, CoachGoalContext, CoachMessageRaw } from '../../services/coachService';
import { useAppStore } from '../../store/useAppStore';

const DAILY_LIMIT = 20;

interface Props {
  goal: Goal;
  palette: Palette;
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

export function CoachChat({ goal, palette: p }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [streamingId, setStreamingId] = useState<string | null>(null);

  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const addSuggestion = useAppStore((s) => s.addSuggestion);
  const incrementCoachUsage = useAppStore((s) => s.incrementCoachUsage);
  const coachUsage = useAppStore((s) => s.coachUsage);

  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(t);
  }, []);

  // Derive today's remaining count reactively so the UI updates without a send
  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const usedToday = coachUsage.date === todayKey ? coachUsage.count : 0;
  const limitReached = usedToday >= DAILY_LIMIT;

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    // Check daily cap before doing anything
    const allowed = incrementCoachUsage();
    if (!allowed) {
      setError("You've reached today's coaching limit — check back tomorrow!");
      return;
    }

    setInput('');
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

      for (const ps of response.suggestions) {
        const s: Suggestion = {
          id: newId(),
          label: ps.label,
          type: ps.type,
          target: ps.target,
          unit: ps.unit,
          ladderStart: ps.start,
          ladderEnd: ps.end,
          ladderWeeks: ps.weeks,
        };
        addSuggestion(s, goal.id);
      }
    } catch {
      setError('Coach is unavailable right now. Try again.');
    } finally {
      setLoading(false);
    }
  };

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
        const textColor = isUser ? p.surface : p.text;

        return (
          <View
            key={msg.id}
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
                onDone={() => setStreamingId(null)}
              />
            ) : (
              <Text style={[styles.bubbleText, { color: textColor }]}>{msg.text}</Text>
            )}
          </View>
        );
      })}

      {loading && (
        <View style={[styles.coachBubble, styles.bubble, { backgroundColor: p.surface }]}>
          <ThinkingDots color={p.muted} />
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
            autoFocus={Platform.OS !== 'web'}
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
          {DAILY_LIMIT - usedToday} of {DAILY_LIMIT} coaching messages remaining today
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
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
