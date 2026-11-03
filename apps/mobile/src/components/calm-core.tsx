import { THEME_COLORS } from '@calm-guardian/shared';
import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';

/**
 * - `ready`: the welcome screen, bright with a small spark of hope
 * - `standing-by`: Calm Mode off, dim
 * - `on`: Calm Mode on, fully lit around a pink spark
 */
export type CoreState = 'ready' | 'standing-by' | 'on';

type CoreLook = { rings: number; arcs: number; fill: number; spark: number | null };

const LOOK: Record<CoreState, CoreLook> = {
  ready: { rings: 0.45, arcs: 0.85, fill: 0.08, spark: 5 },
  'standing-by': { rings: 0.3, arcs: 0.4, fill: 0.04, spark: null },
  on: { rings: 0.65, arcs: 1, fill: 0.14, spark: 8 },
};

/** One slow breath. Slow and gentle on purpose: nothing here should flash or feel urgent. */
const BREATH_MS = 3500;

const AQUA = THEME_COLORS.primary;
const HOPE = THEME_COLORS.hope;

/**
 * The glowing rings at the heart of the app, showing Calm Mode's state at a glance. Decorative: the
 * screen always states the same thing in words, so screen readers skip it. It breathes slowly, and
 * stays still when the user has asked for reduced motion.
 */
export function CalmCore({ state, size = 220 }: { state: CoreState; size?: number }) {
  const look = LOOK[state];
  const breathing = useBreathing();

  return (
    <Animated.View
      style={[{ width: size, height: size }, breathing]}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={size} height={size} viewBox="0 0 220 220">
        <Circle
          cx={110}
          cy={110}
          r={104}
          fill="none"
          stroke={AQUA}
          strokeOpacity={look.rings / 3}
        />
        <Circle
          cx={110}
          cy={110}
          r={88}
          fill="none"
          stroke={AQUA}
          strokeOpacity={look.rings}
          strokeWidth={2}
          strokeDasharray="1 7"
        />
        <Path d="M110 22 A88 88 0 0 1 198 110" {...arcProps(look.arcs)} />
        <Path d="M110 198 A88 88 0 0 1 22 110" {...arcProps(look.arcs)} />
        <Circle cx={110} cy={110} r={64} fill="none" stroke={AQUA} strokeOpacity={look.rings} />
        <Circle
          cx={110}
          cy={110}
          r={40}
          fill={AQUA}
          fillOpacity={look.fill}
          stroke={AQUA}
          strokeOpacity={look.arcs * 0.8}
          strokeWidth={1.5}
        />
        <Line x1={110} y1={0} x2={110} y2={12} stroke={AQUA} strokeOpacity={look.rings} />
        <Line x1={110} y1={208} x2={110} y2={220} stroke={AQUA} strokeOpacity={look.rings} />
        <Line x1={0} y1={110} x2={12} y2={110} stroke={AQUA} strokeOpacity={look.rings} />
        <Line x1={208} y1={110} x2={220} y2={110} stroke={AQUA} strokeOpacity={look.rings} />
        {look.spark === null ? (
          <Circle cx={110} cy={110} r={4} fill={AQUA} fillOpacity={0.6} />
        ) : (
          <>
            <Circle cx={110} cy={110} r={look.spark * 2.5} fill={HOPE} fillOpacity={0.2} />
            <Circle cx={110} cy={110} r={look.spark} fill={HOPE} />
          </>
        )}
      </Svg>
    </Animated.View>
  );
}

function arcProps(opacity: number) {
  return {
    fill: 'none',
    stroke: AQUA,
    strokeOpacity: opacity,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
  };
}

function useBreathing() {
  const prefersReducedMotion = useReducedMotion();
  const breath = useSharedValue(0);

  useEffect(() => {
    if (prefersReducedMotion) return;
    breath.value = withRepeat(
      withTiming(1, { duration: BREATH_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [breath, prefersReducedMotion]);

  return useAnimatedStyle(() => ({
    opacity: 0.8 + breath.value * 0.2,
    transform: [{ scale: 1 + breath.value * 0.03 }],
  }));
}
