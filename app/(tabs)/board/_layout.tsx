import { Stack } from 'expo-router';

// The Board tab's OWN stack, nested inside the (tabs) Tabs navigator — this
// is what keeps the bottom tab bar visible while a goal is open. Every
// screen here (the board itself, and every app/goal/[id]/* route now living
// under board/goal/[id]/*) renders inside this tab's content area, with the
// Tabs navigator's bar persisting around it, instead of goal screens being a
// separate root-level stack with no tab bar at all. Per-screen animation
// options for the goal routes carried over unchanged from the root layout.
export default function BoardStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      {/* Not a modal: the canvas grows out of the tapped bubble (see
          RadialBoard's onPress) and shrinks back into it on the way out
          (see the goal canvas's handleBackToBoard) — a swipe-down dismissal
          would fight that illusion, so it's off entirely rather than just
          discouraged. A plain fade lets those two local scale animations
          carry the transition instead of a slide competing with them. */}
      <Stack.Screen
        name="goal/[id]/index"
        options={{ animation: 'fade', gestureEnabled: false }}
      />
      <Stack.Screen name="goal/[id]/milestones" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="goal/[id]/measurables" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
