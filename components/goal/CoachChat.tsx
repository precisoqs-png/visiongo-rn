import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Goal, ChatMessage, Suggestion, newId } from '../../store/models';
import { Palette, FONTS } from '../../theme/themes';
import { coachService, buildSystemPrompt, CoachGoalContext, CoachMessageRaw } from '../../services/coachService';
import { useAppStore } from '../../store/useAppStore';

interface Props {
  goal: Goal;
  palette: Palette;
}

export function CoachChat({ goal, palette: p }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const addChatMessage = useAppStore((s) => s.addChatMessage);
  const addSuggestion = useAppStore((s) => s.addSuggestion);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setError('');

    const userMsg: ChatMessage = { id: newId(), sender: 'user', text, timestamp: new Date().toISOString() };
    addChatMessage(userMsg, goal.id);
    setLoading(true);

    const cal = (d: string) => {
      const ms = new Date(d).getTime() - Date.now();
      return Math.max(0, Math.round(ms / (7 * 24 * 60 * 60 * 1000)));
    };
    const ctx: CoachGoalContext = {
      goalTitle: goal.title,
      achieveByDate: goal.targetDate,
      weeksRemaining: goal.targetDate ? cal(goal.targetDate) : undefined,
      today: new Date(),
    };

    const history: CoachMessageRaw[] = goal.chat.map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      text: m.text,
    }));

    try {
      const response = await coachService.send(history, ctx);
      const coachMsg: ChatMessage = {
        id: newId(), sender: 'coach', text: response.text, timestamp: new Date().toISOString(),
      };
      addChatMessage(coachMsg, goal.id);

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
            Your AI coach is here to help turn your goal into an action plan. Ask anything to get started!
          </Text>
        </View>
      )}

      {goal.chat.map((msg) => (
        <View
          key={msg.id}
          style={[
            styles.bubble,
            msg.sender === 'user'
              ? [styles.userBubble, { backgroundColor: p.accent }]
              : [styles.coachBubble, { backgroundColor: p.surface }],
          ]}
        >
          <Text style={[styles.bubbleText, { color: msg.sender === 'user' ? p.surface : p.text }]}>
            {msg.text}
          </Text>
        </View>
      ))}

      {loading && (
        <View style={[styles.coachBubble, styles.bubble, { backgroundColor: p.surface }]}>
          <ActivityIndicator size="small" color={p.accent} />
        </View>
      )}
      {!!error && (
        <Text style={[styles.error, { color: '#c0392b' }]}>{error}</Text>
      )}

      {/* Input bar */}
      <View style={[styles.inputRow, { backgroundColor: p.surface }]}>
        <TextInput
          style={[styles.input, { color: p.text }]}
          placeholder="Message your coach…"
          placeholderTextColor={p.muted}
          value={input}
          onChangeText={setInput}
          multiline
          returnKeyType="send"
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: input.trim() ? p.accent : p.muted }]}
          onPress={sendMessage}
          disabled={!input.trim() || loading}
        >
          <Ionicons name="arrow-up" size={16} color={p.surface} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, marginBottom: 10 },
  emptyCard: { borderRadius: 14, padding: 16, marginBottom: 10 },
  emptyText: { fontSize: 14, lineHeight: 20 },
  bubble: { maxWidth: '80%', marginBottom: 8, borderRadius: 14, padding: 12 },
  coachBubble: { alignSelf: 'flex-start' },
  userBubble: { alignSelf: 'flex-end' },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  error: { fontSize: 13, marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 20,
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
