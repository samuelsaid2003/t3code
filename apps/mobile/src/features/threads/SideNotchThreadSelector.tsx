import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  isLiquidGlassSupported,
  LiquidGlassContainerView,
  LiquidGlassView,
} from "@callstack/liquid-glass";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { PlatformColor, StyleSheet, View, type AccessibilityActionEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "../../components/AppText";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";
import {
  sideNotchSelectionIndex,
  sideNotchSnapOffset,
  sideNotchThreadIndex,
  sideNotchThreads,
  sideNotchWheelThreads,
  type SideNotchMode,
} from "./side-notch-navigation";

const CLOSED_HEIGHT = 58;
const CLOSED_WIDTH = 17;
const EXPANDED_HEIGHT = 236;
const EXPANDED_WIDTH = 244;
const HANDLE_WIDTH = 30;
const ROW_HEIGHT = 44;
const OPEN_ANIMATION = { duration: 170 } as const;
const SNAP_ANIMATION = { duration: 130 } as const;
const AnimatedLiquidGlassView = Animated.createAnimatedComponent(LiquidGlassView);

function NotchSurface(props: {
  readonly children: ReactNode;
  readonly colorScheme: "light" | "dark";
  readonly expanded: SharedValue<number>;
}) {
  const { expanded } = props;
  const shoulderStyle = useAnimatedStyle(() => ({
    opacity: 1 - expanded.value,
    transform: [{ scale: interpolate(expanded.value, [0, 1], [1, 0.01]) }],
  }));
  const fallbackBackground =
    props.colorScheme === "dark" ? "rgba(47,47,52,0.82)" : "rgba(232,232,237,0.84)";

  if (!isLiquidGlassSupported) {
    return (
      <>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shoulder,
            styles.fallbackShoulderTop,
            { backgroundColor: fallbackBackground },
            shoulderStyle,
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shoulder,
            styles.fallbackShoulderBottom,
            { backgroundColor: fallbackBackground },
            shoulderStyle,
          ]}
        />
        <View
          pointerEvents="none"
          style={[styles.surface, { backgroundColor: fallbackBackground }]}
        >
          {props.children}
        </View>
      </>
    );
  }

  return (
    <LiquidGlassContainerView pointerEvents="none" spacing={7} style={styles.glassCluster}>
      <AnimatedLiquidGlassView
        colorScheme={props.colorScheme}
        effect="regular"
        pointerEvents="none"
        style={[styles.shoulder, styles.clusterShoulderTop, shoulderStyle]}
      />
      <AnimatedLiquidGlassView
        colorScheme={props.colorScheme}
        effect="regular"
        pointerEvents="none"
        style={[styles.shoulder, styles.clusterShoulderBottom, shoulderStyle]}
      />
      <LiquidGlassView
        colorScheme={props.colorScheme}
        effect="regular"
        pointerEvents="none"
        style={styles.clusterSurface}
      >
        {props.children}
      </LiquidGlassView>
    </LiquidGlassContainerView>
  );
}

function WheelRow(props: {
  readonly currentIndex: number;
  readonly dragOffset: SharedValue<number>;
  readonly expanded: SharedValue<number>;
  readonly index: number;
  readonly title: string;
}) {
  const { currentIndex, dragOffset, expanded, index } = props;
  const rowStyle = useAnimatedStyle(() => {
    const relativePosition = index - currentIndex + dragOffset.value / ROW_HEIGHT;
    const distance = Math.abs(relativePosition);
    return {
      opacity: expanded.value * interpolate(distance, [0, 1, 2, 2.75], [1, 0.58, 0.22, 0]),
      transform: [
        { translateY: relativePosition * ROW_HEIGHT },
        { scale: interpolate(distance, [0, 1, 2], [1, 0.94, 0.88]) },
      ],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.row, rowStyle]}>
      <AppText
        className="text-center text-[15px] font-t3-semibold"
        numberOfLines={1}
        style={{ color: PlatformColor("labelColor") }}
      >
        {props.title}
      </AppText>
    </Animated.View>
  );
}

export function SideNotchThreadSelector(props: {
  readonly currentThread: EnvironmentThreadShell;
  readonly mode: SideNotchMode;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly onSelectThread: (thread: EnvironmentThreadShell) => void;
}) {
  const insets = useSafeAreaInsets();
  const { onSelectThread } = props;
  const { themeAppearance } = useAppearancePreferences();
  const colorScheme = themeAppearance === "dark" ? "dark" : "light";
  const allCandidates = useMemo(
    () => sideNotchThreads(props.threads, props.mode),
    [props.mode, props.threads],
  );
  const candidates = useMemo(
    () => sideNotchWheelThreads(allCandidates, props.currentThread),
    [allCandidates, props.currentThread],
  );
  const currentIndex = sideNotchThreadIndex(candidates, props.currentThread);

  const expanded = useSharedValue(0);
  const dragOffset = useSharedValue(0);
  const selectedIndex = useSharedValue(currentIndex);
  const panActive = useSharedValue(false);

  useEffect(() => {
    selectedIndex.value = currentIndex;
    dragOffset.value = 0;
    expanded.value = withTiming(0, OPEN_ANIMATION);
  }, [currentIndex, dragOffset, expanded, selectedIndex]);

  const hapticTick = useCallback(() => {
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const selectAt = useCallback(
    (index: number) => {
      const thread = candidates[index];
      if (!thread || index === currentIndex) return;
      onSelectThread(thread);
    },
    [candidates, currentIndex, onSelectThread],
  );

  const toggleExpanded = useCallback(() => {
    expanded.value = withTiming(expanded.value > 0.5 ? 0 : 1, OPEN_ANIMATION);
  }, [expanded]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(5)
      .onStart(() => {
        panActive.value = true;
        selectedIndex.value = currentIndex;
        dragOffset.value = 0;
        expanded.value = withTiming(1, OPEN_ANIMATION);
      })
      .onUpdate((event) => {
        const minimum = -(candidates.length - 1 - currentIndex) * ROW_HEIGHT;
        const maximum = currentIndex * ROW_HEIGHT;
        let offset = event.translationY;
        if (offset < minimum) offset = minimum + (offset - minimum) * 0.16;
        if (offset > maximum) offset = maximum + (offset - maximum) * 0.16;
        dragOffset.value = offset;

        const nextIndex = sideNotchSelectionIndex({
          currentIndex,
          threadCount: candidates.length,
          translationY: offset,
          rowHeight: ROW_HEIGHT,
        });
        if (nextIndex !== selectedIndex.value) {
          selectedIndex.value = nextIndex;
          runOnJS(hapticTick)();
        }
      })
      .onEnd((event) => {
        panActive.value = false;
        const nextIndex = sideNotchSelectionIndex({
          currentIndex,
          threadCount: candidates.length,
          translationY: dragOffset.value,
          velocityY: event.velocityY,
          rowHeight: ROW_HEIGHT,
        });
        selectedIndex.value = nextIndex;
        dragOffset.value = withTiming(
          sideNotchSnapOffset({
            currentIndex,
            selectedIndex: nextIndex,
            rowHeight: ROW_HEIGHT,
          }),
          SNAP_ANIMATION,
          (finished) => {
            if (!finished) return;
            expanded.value = withTiming(0, OPEN_ANIMATION);
            if (nextIndex !== currentIndex) runOnJS(selectAt)(nextIndex);
          },
        );
      })
      .onFinalize((_event, successful) => {
        if (successful || !panActive.value) return;
        panActive.value = false;
        selectedIndex.value = currentIndex;
        dragOffset.value = withTiming(0, SNAP_ANIMATION);
        expanded.value = withTiming(0, OPEN_ANIMATION);
      });

    const tap = Gesture.Tap()
      .maxDistance(8)
      .onEnd(() => {
        expanded.value = withTiming(expanded.value > 0.5 ? 0 : 1, OPEN_ANIMATION);
      });

    return Gesture.Race(pan, tap);
  }, [
    candidates.length,
    currentIndex,
    dragOffset,
    expanded,
    hapticTick,
    panActive,
    selectAt,
    selectedIndex,
  ]);

  const containerStyle = useAnimatedStyle(() => {
    const height = interpolate(expanded.value, [0, 1], [CLOSED_HEIGHT, EXPANDED_HEIGHT]);
    return {
      height,
      top: (EXPANDED_HEIGHT - height) / 2,
      width: interpolate(expanded.value, [0, 1], [CLOSED_WIDTH, EXPANDED_WIDTH]),
    };
  });
  const wheelStyle = useAnimatedStyle(() => ({ opacity: expanded.value }));
  const handleStyle = useAnimatedStyle(() => ({
    backgroundColor:
      colorScheme === "dark"
        ? `rgba(255,255,255,${interpolate(expanded.value, [0, 1], [0, 0.08])})`
        : `rgba(0,0,0,${interpolate(expanded.value, [0, 1], [0, 0.05])})`,
  }));

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "increment") {
      hapticTick();
      selectAt(currentIndex + 1);
    }
    if (event.nativeEvent.actionName === "decrement") {
      hapticTick();
      selectAt(currentIndex - 1);
    }
    if (event.nativeEvent.actionName === "activate") toggleExpanded();
  };

  if (currentIndex < 0 || candidates.length === 0) return null;

  return (
    <View
      className="absolute z-[120]"
      pointerEvents="box-none"
      style={[styles.anchor, { right: insets.right }]}
    >
      <GestureDetector gesture={gesture}>
        <Animated.View
          accessible
          accessibilityActions={[
            { name: "increment", label: "Next conversation" },
            { name: "decrement", label: "Previous conversation" },
            { name: "activate", label: "Open conversation wheel" },
          ]}
          accessibilityHint="Drag vertically to move through conversations, then release to open the centered conversation"
          accessibilityLabel="Conversation wheel"
          accessibilityRole="adjustable"
          accessibilityValue={{ text: props.currentThread.title }}
          onAccessibilityAction={handleAccessibilityAction}
          style={[styles.notch, containerStyle]}
          testID="side-notch-thread-selector"
        >
          <NotchSurface colorScheme={colorScheme} expanded={expanded}>
            <Animated.View pointerEvents="none" style={[styles.wheel, wheelStyle]}>
              <View
                style={[
                  styles.selectionTrack,
                  colorScheme === "dark" ? styles.selectionTrackDark : styles.selectionTrackLight,
                ]}
              />
              {candidates.map((thread, index) => (
                <WheelRow
                  currentIndex={currentIndex}
                  dragOffset={dragOffset}
                  expanded={expanded}
                  index={index}
                  key={`${thread.environmentId}:${thread.id}`}
                  title={thread.title}
                />
              ))}
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.handle, handleStyle]}>
              <View style={styles.grabber} />
            </Animated.View>
          </NotchSurface>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    height: EXPANDED_HEIGHT,
    top: "50%",
    transform: [{ translateY: -EXPANDED_HEIGHT / 2 }],
    width: EXPANDED_WIDTH,
  },
  grabber: {
    backgroundColor: PlatformColor("secondaryLabelColor"),
    borderRadius: 999,
    height: 20,
    opacity: 0.62,
    width: 2,
  },
  glassCluster: {
    bottom: -14,
    left: -10,
    position: "absolute",
    right: -8,
    top: -14,
  },
  clusterShoulderBottom: {
    bottom: 0,
    right: 0,
  },
  clusterShoulderTop: {
    right: 0,
    top: 0,
  },
  handle: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    position: "absolute",
    right: -6,
    top: 0,
    width: HANDLE_WIDTH,
  },
  notch: {
    position: "absolute",
    right: 0,
    shadowColor: "#000",
    shadowOffset: { height: 6, width: -3 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  row: {
    height: ROW_HEIGHT,
    justifyContent: "center",
    left: 12,
    paddingHorizontal: 12,
    position: "absolute",
    right: HANDLE_WIDTH + 4,
    top: EXPANDED_HEIGHT / 2 - ROW_HEIGHT / 2,
  },
  selectionTrack: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    height: ROW_HEIGHT - 4,
    left: 10,
    position: "absolute",
    right: HANDLE_WIDTH + 4,
    top: EXPANDED_HEIGHT / 2 - ROW_HEIGHT / 2 + 2,
  },
  selectionTrackDark: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.14)",
  },
  selectionTrackLight: {
    backgroundColor: "rgba(255,255,255,0.42)",
    borderColor: "rgba(255,255,255,0.58)",
  },
  fallbackShoulderBottom: {
    bottom: -14,
    right: -8,
  },
  fallbackShoulderTop: {
    right: -8,
    top: -14,
  },
  shoulder: {
    borderCurve: "continuous",
    borderRadius: 14,
    height: 28,
    position: "absolute",
    width: 28,
  },
  clusterSurface: {
    bottom: 14,
    borderBottomLeftRadius: 28,
    borderCurve: "continuous",
    borderTopLeftRadius: 28,
    left: 10,
    overflow: "hidden",
    position: "absolute",
    right: 8,
    top: 14,
  },
  surface: {
    bottom: 0,
    borderBottomLeftRadius: 28,
    borderCurve: "continuous",
    borderTopLeftRadius: 28,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
  },
  wheel: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
});
