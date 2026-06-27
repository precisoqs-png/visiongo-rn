import React from 'react';
import Svg, { Circle } from 'react-native-svg';

interface Props {
  size: number;
  progress: number; // 0..1
  trackColor: string;
  fillColor: string;
  strokeWidth?: number;
}

export function ProgressRing({ size, progress, trackColor, fillColor, strokeWidth = 4 }: Props) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(Math.max(progress, 0), 1));

  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={trackColor} strokeWidth={strokeWidth}
        fill="none"
      />
      <Circle
        cx={size / 2} cy={size / 2} r={r}
        stroke={fillColor} strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </Svg>
  );
}
