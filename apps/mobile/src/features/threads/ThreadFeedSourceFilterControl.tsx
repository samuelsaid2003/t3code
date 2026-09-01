import * as Haptics from "expo-haptics";
import { IconBrandSlack } from "@tabler/icons-react-native";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { useUniwindTheme } from "../../lib/useUniwindTheme";
import type { ThreadFeedSourceFilter, ThreadFeedSourcePresentation } from "./slackThreadFeedFilter";

export const SLACK_THREAD_FEED_FILTER_HEIGHT = 44;

const OPTIONS = [
  { label: "All", value: "all" },
  { label: "T3", value: "t3" },
  { label: "Slack", value: "slack" },
] as const;

export function SlackThreadFeedFilter(props: {
  readonly onChange: (value: ThreadFeedSourceFilter) => void;
  readonly presentation: ThreadFeedSourcePresentation;
  readonly value: ThreadFeedSourceFilter;
}) {
  const theme = useUniwindTheme();
  const iconColor = String(theme["--color-icon-subtle"]);
  const status =
    props.value === "all"
      ? `${props.presentation.slackTurnCount} from Slack`
      : `${props.presentation.hiddenTurnCount} ${props.value === "slack" ? "T3" : "Slack"} ${props.presentation.hiddenTurnCount === 1 ? "turn" : "turns"} hidden`;

  return (
    <View
      accessibilityLabel={`Conversation source. ${status}`}
      className="mx-auto h-9 w-[232px] flex-row items-center justify-between rounded-full border border-border bg-card px-1 shadow-sm shadow-black/5"
    >
      <View className="ml-2 flex-row items-center gap-1.5">
        <IconBrandSlack size={13} color={iconColor} strokeWidth={1.8} />
        <Text className="font-t3-medium text-[11px] text-foreground-muted">
          {props.value === "all"
            ? props.presentation.slackTurnCount
            : props.presentation.hiddenTurnCount}
        </Text>
      </View>
      <View className="flex-row items-center rounded-full bg-subtle p-0.5">
        {OPTIONS.map((option) => {
          const selected = option.value === props.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`Show ${option.label} conversation turns`}
              accessibilityState={{ selected }}
              hitSlop={4}
              onPress={() => {
                if (selected) return;
                void Haptics.selectionAsync();
                props.onChange(option.value);
              }}
              className={
                selected
                  ? "min-w-12 items-center rounded-full bg-card px-2.5 py-1 shadow-sm shadow-black/5"
                  : "min-w-12 items-center rounded-full px-2.5 py-1 active:opacity-60"
              }
            >
              <Text
                className={
                  selected
                    ? "font-t3-medium text-xs text-foreground"
                    : "font-t3-medium text-xs text-foreground-muted"
                }
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
