import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { isLiquidGlassSupported, LiquidGlassView } from "@callstack/liquid-glass";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { PlatformColor, StyleSheet, View, type AccessibilityActionEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "../../components/AppText";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/time";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";
import { THREAD_LIST_V2_STATUS_LABELS } from "./thread-list-v2-items";
import { resolveThreadListV2Status } from "./threadListV2";
import {
  sideNotchSelectionIndex,
  sideNotchSnapOffset,
  sideNotchThreadIndex,
  sideNotchThreads,
  sideNotchWheelThreads,
  type SideNotchMode,
} from "./side-notch-navigation";

const CLOSED_HEIGHT = 64;
const CLOSED_WIDTH = 14;
const EXPANDED_HEIGHT = 236;
const EXPANDED_WIDTH = 244;
const ROW_HEIGHT = 44;
// The surface hangs past the screen edge so its right corners never show and
// the visible left corners dissolve into the edge instead of forming a pill.
const EDGE_OVERHANG = 40;
const SURFACE_RADIUS = 26;
const GESTURE_SLOP = { left: 16 } as const;
const OPEN_ANIMATION = { duration: 170, reduceMotion: ReduceMotion.System } as const;
const SNAP_ANIMATION = { duration: 130, reduceMotion: ReduceMotion.System } as const;

function NotchSurface(props: {
  readonly children: ReactNode;
  readonly colorScheme: "light" | "dark";
}) {
  if (!isLiquidGlassSupported) {
    const fallbackBackground =
      props.colorScheme === "dark" ? "rgba(44,44,48,0.9)" : "rgba(235,235,240,0.9)";
    return (
      <View pointerEvents="none" style={[styles.surface, { backgroundColor: fallbackBackground }]}>
        {props.children}
      </View>
    );
  }

  return (
    <LiquidGlassView
      colorScheme={props.colorScheme}
      effect="regular"
      pointerEvents="none"
      style={styles.surface}
    >
      {props.children}
    </LiquidGlassView>
  );
}

function WheelRow(props: {
  readonly currentIndex: number;
  readonly dragOffset: SharedValue<number>;
  readonly expanded: SharedValue<number>;
  readonly index: number;
  readonly thread: EnvironmentThreadShell;
}) {
  const { currentIndex, dragOffset, expanded, index, thread } = props;
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

  const statusLabel = THREAD_LIST_V2_STATUS_LABELS[resolveThreadListV2Status(thread)];
  const timeLabel = relativeTime(
    thread.latestUserMessageAt ?? thread.updatedAt ?? thread.createdAt,
  );

  return (
    <Animated.View pointerEvents="none" style={[styles.row, rowStyle]}>
      <AppText
        className="flex-1 text-[15px] font-t3-semibold"
        numberOfLines={1}
        style={{ color: PlatformColor("labelColor") }}
      >
        {thread.title}
      </AppText>
      <AppText
        className={cn("text-xs tabular-nums", statusLabel?.className ?? "text-foreground-tertiary")}
      >
        {statusLabel?.label ?? timeLabel}
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
      .hitSlop(GESTURE_SLOP)
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
      .hitSlop(GESTURE_SLOP)
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
      shadowOpacity: interpolate(expanded.value, [0, 1], [0, 0.16]),
      top: (EXPANDED_HEIGHT - height) / 2,
      width: interpolate(expanded.value, [0, 1], [CLOSED_WIDTH, EXPANDED_WIDTH]),
    };
  });
  const wheelStyle = useAnimatedStyle(() => ({ opacity: expanded.value }));

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
          <NotchSurface colorScheme={colorScheme}>
            <Animated.View pointerEvents="none" style={[styles.wheel, wheelStyle]}>
              {candidates.map((thread, index) => (
                <WheelRow
                  currentIndex={currentIndex}
                  dragOffset={dragOffset}
                  expanded={expanded}
                  index={index}
                  key={`${thread.environmentId}:${thread.id}`}
                  thread={thread}
                />
              ))}
            </Animated.View>
            <View pointerEvents="none" style={styles.grabber} />
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
    opacity: 0.55,
    position: "absolute",
    right: EDGE_OVERHANG + (CLOSED_WIDTH - 2) / 2,
    top: "50%",
    transform: [{ translateY: -10 }],
    width: 2,
  },
  notch: {
    position: "absolute",
    right: 0,
    shadowColor: "#000",
    shadowOffset: { height: 4, width: -2 },
    shadowRadius: 12,
  },
  row: {
    alignItems: "center",
    columnGap: 8,
    flexDirection: "row",
    height: ROW_HEIGHT,
    left: 16,
    paddingHorizontal: 8,
    position: "absolute",
    right: 24,
    top: EXPANDED_HEIGHT / 2 - ROW_HEIGHT / 2,
  },
  surface: {
    borderCurve: "continuous",
    borderRadius: SURFACE_RADIUS,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: -EDGE_OVERHANG,
    top: 0,
  },
  wheel: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: EDGE_OVERHANG,
    top: 0,
  },
});
