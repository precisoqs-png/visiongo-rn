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

// ── Typewriter text — streams word by word ───────────────────

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

// ── Main chat component ──────────────────────────────────────

export function CoachChat({ goal, palette: p }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Track the most recent coach message ID so we apply typewriter only to it
  const [streamingId, setStreamingId] = useState<string | null>(null);

  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const addSuggestion = useAppStore((s) => s.addSuggestion);

  const inputRef = useRef<TextInput>(null);

  // Auto-focus when coach section mounts
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(t);
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
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

    const history: CoachMessageRaw[] = goal.chat.map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      text: m.text,
    }));

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

      {/* Input bar */}
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
          // Web-compatible auto-focus via ref + setTimeout above
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
