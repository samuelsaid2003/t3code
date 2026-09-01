import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import * as Haptics from "expo-haptics";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "../../components/AppText";
import {
  sideNotchPreviewIndex,
  sideNotchThreadIndex,
  sideNotchThreads,
  type SideNotchMode,
} from "./side-notch-navigation";

const MAX_PICKER_THREADS = 12;

export function SideNotchThreadSelector(props: {
  readonly currentThread: EnvironmentThreadShell;
  readonly mode: SideNotchMode;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly onSelectThread: (thread: EnvironmentThreadShell) => void;
}) {
  const insets = useSafeAreaInsets();
  const candidates = useMemo(
    () => sideNotchThreads(props.threads, props.mode),
    [props.mode, props.threads],
  );
  const currentIndex = sideNotchThreadIndex(candidates, props.currentThread);
  const previewIndexRef = useRef<number | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const setPreview = useCallback((index: number | null) => {
    if (previewIndexRef.current === index) return;
    const previous = previewIndexRef.current;
    previewIndexRef.current = index;
    setPreviewIndex(index);
    if (index !== null && previous !== null && index !== previous) {
      for (let step = 0; step < Math.abs(index - previous); step += 1) {
        void Haptics.selectionAsync().catch(() => undefined);
      }
    }
  }, []);

  const updatePreview = useCallback(
    (translationY: number) => {
      const nextIndex = sideNotchPreviewIndex({
        currentIndex,
        threadCount: candidates.length,
        translationY,
      });
      if (nextIndex >= 0) setPreview(nextIndex);
    },
    [candidates.length, currentIndex, setPreview],
  );

  const finishGesture = useCallback(
    (translationY: number, successful: boolean) => {
      const nextIndex = successful
        ? sideNotchPreviewIndex({
            currentIndex,
            threadCount: candidates.length,
            translationY,
          })
        : currentIndex;
      const nextThread = nextIndex >= 0 ? candidates[nextIndex] : undefined;
      setPreview(null);
      if (successful && nextIndex !== currentIndex && nextThread) {
        props.onSelectThread(nextThread);
      }
    },
    [candidates, currentIndex, props, setPreview],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-12, 12])
        .failOffsetX([-18, 18])
        .onStart(() => {
          runOnJS(setPreview)(currentIndex);
        })
        .onUpdate((event) => {
          runOnJS(updatePreview)(event.translationY);
        })
        .onFinalize((event, successful) => {
          runOnJS(finishGesture)(event.translationY, successful);
        }),
    [currentIndex, finishGesture, setPreview, updatePreview],
  );

  const selectAt = useCallback(
    (index: number) => {
      const thread = candidates[index];
      if (thread && index !== currentIndex) props.onSelectThread(thread);
    },
    [candidates, currentIndex, props],
  );

  const openPicker = useCallback(() => {
    const visible = candidates.slice(0, MAX_PICKER_THREADS);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...visible.map((thread) => thread.title), "Cancel"],
        cancelButtonIndex: visible.length,
        title: props.mode === "agents" ? "Switch Agent Chat" : "Switch Thread",
      },
      (buttonIndex) => {
        if (buttonIndex < visible.length) selectAt(buttonIndex);
      },
    );
  }, [candidates, props.mode, selectAt]);

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "increment") selectAt(currentIndex + 1);
    if (event.nativeEvent.actionName === "decrement") selectAt(currentIndex - 1);
    if (event.nativeEvent.actionName === "activate") openPicker();
  };

  if (currentIndex < 0 || candidates.length === 0) return null;

  const previewThreads =
    previewIndex === null
      ? []
      : candidates.slice(
          Math.max(0, previewIndex - 1),
          Math.min(candidates.length, previewIndex + 2),
        );
  const previewThread = previewIndex === null ? null : candidates[previewIndex];

  return (
    <View
      className="absolute z-[120] h-28 w-7"
      pointerEvents="box-none"
      style={[styles.anchor, { right: insets.right }]}
    >
      {previewThread ? (
        <View className="absolute right-9 top-1/2 w-52 -translate-y-1/2 gap-1 rounded-2xl border border-white/15 bg-black/90 p-2.5 shadow-lg">
          {previewThreads.map((thread) => (
            <View
              className={`rounded-lg px-2.5 py-2 ${thread.id === previewThread.id && thread.environmentId === previewThread.environmentId ? "bg-white/15" : "bg-transparent"}`}
              key={`${thread.environmentId}:${thread.id}`}
            >
              <AppText
                className={`text-sm ${thread.id === previewThread.id && thread.environmentId === previewThread.environmentId ? "font-t3-semibold text-white" : "text-white/55"}`}
                numberOfLines={1}
              >
                {thread.title}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Pressable
          accessibilityActions={[
            { name: "increment", label: "Next conversation" },
            { name: "decrement", label: "Previous conversation" },
            { name: "activate", label: "Open conversation picker" },
          ]}
          accessibilityHint="Drag vertically to switch conversations or tap to open the picker"
          accessibilityLabel="Conversation switcher"
          accessibilityRole="adjustable"
          accessibilityValue={{ text: props.currentThread.title }}
          className="h-28 w-7 items-center justify-center rounded-l-[18px] border-y border-l border-white/15 bg-black shadow-lg"
          onAccessibilityAction={handleAccessibilityAction}
          onPress={openPicker}
          testID="side-notch-thread-selector"
        >
          <View className="h-9 w-1 rounded-full bg-white/30" />
        </Pressable>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    top: "43%",
  },
});
