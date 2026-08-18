import { useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

// Tracks whether a ScrollView is "near its own bottom" without needing a
// render (read via `.current`, same pattern as any other perf-sensitive
// ref). Deliberately covers the case a plain onScroll listener alone
// doesn't: a page short enough that it never actually scrolls never fires
// onScroll at all, so a ref that only updates from onScroll gets stuck at
// whatever it was initialized to — wrong either way, since "near bottom"
// is trivially true when there's nothing to scroll past. This combines
// onScroll (the normal case) with onLayout/onContentSizeChange (which fire
// regardless of scrollability) so the answer is always current.
export function useNearBottom(threshold = 80) {
  const nearBottomRef = useRef(true);
  const contentHeightRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const offsetRef = useRef(0);

  const recompute = () => {
    const contentH = contentHeightRef.current;
    const viewportH = viewportHeightRef.current;
    nearBottomRef.current =
      contentH <= viewportH || offsetRef.current + viewportH >= contentH - threshold;
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    offsetRef.current = contentOffset.y;
    layoutMeasurement && (viewportHeightRef.current = layoutMeasurement.height);
    contentSize && (contentHeightRef.current = contentSize.height);
    recompute();
  };

  const onLayout = (e: { nativeEvent: { layout: { height: number } } }) => {
    viewportHeightRef.current = e.nativeEvent.layout.height;
    recompute();
  };

  const onContentSizeChange = (_w: number, h: number) => {
    contentHeightRef.current = h;
    recompute();
  };

  return { nearBottomRef, onScroll, onLayout, onContentSizeChange };
}
