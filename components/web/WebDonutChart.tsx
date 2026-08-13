// Donut chart built on react-native-svg (already a dependency — no new
// package). Each category is a stroked arc segment on a circle
// (strokeDasharray/strokeDashoffset trick), with a small gap between
// segments per the dataviz mark spec. Colors are the app's existing,
// already-established category palette (constants/theme.ts `Categories`)
// reused as-is — not a fresh chart-specific palette — so the chart stays
// visually consistent with every other screen that already uses these
// colors (category icons, chips, bars).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '@/constants/theme';

export interface DonutSlice {
  id: string;
  color: string;
  value: number;
}

interface Props {
  data: DonutSlice[];
  total: number;
  size?: number;
  strokeWidth?: number;
  centerLabel: string;
  centerValue: string;
}

const GAP_DEG = 2.2; // visual gap between segments, in degrees of arc

export default function WebDonutChart({ data, total, size = 190, strokeWidth = 24, centerLabel, centerValue }: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const gapLength = (GAP_DEG / 360) * circumference;

  let cumulative = 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data.map((slice) => {
          const fraction = total > 0 ? slice.value / total : 0;
          const rawLength = fraction * circumference;
          const segLength = Math.max(0, rawLength - gapLength);
          const dashArray = `${segLength} ${circumference - segLength}`;
          const dashOffset = -cumulative;
          cumulative += rawLength;
          return (
            <Circle
              key={slice.id}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={slice.color}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              fill="none"
              // Rotate so the first segment starts at 12 o'clock instead of 3 o'clock.
              origin={`${size / 2}, ${size / 2}`}
              rotation={-90}
            />
          );
        })}
      </Svg>
      <View style={styles.centerOverlay} pointerEvents="none">
        <Text style={styles.centerValue} numberOfLines={1}>{centerValue}</Text>
        <Text style={styles.centerLabel}>{centerLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: { color: Colors.text, fontSize: 20, fontWeight: '800' },
  centerLabel: { color: Colors.outline, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.05, marginTop: 3 },
});
