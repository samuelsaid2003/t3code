import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { useHeaderHeight } from "@react-navigation/elements";
import { View } from "react-native";

import type { MobileThreadListMode } from "./agent-chat-navigation";

const VALUES = ["Threads", "Agents"];

export function AgentListModeControl(props: {
  readonly mode: MobileThreadListMode;
  readonly onChange: (mode: MobileThreadListMode) => void;
  readonly compact?: boolean;
  readonly nativeHeaderInset?: boolean;
}) {
  const headerHeight = useHeaderHeight();
  const verticalInset = props.compact ? 10 : 8;
  return (
    <View
      className={props.compact ? "bg-screen px-5 pb-2.5" : "bg-drawer px-3 pb-2"}
      style={{
        marginTop: props.nativeHeaderInset ? headerHeight : 0,
        paddingTop: verticalInset,
      }}
      testID="agent-list-mode-control"
    >
      <SegmentedControl
        values={VALUES}
        selectedIndex={props.mode === "threads" ? 0 : 1}
        onChange={(event) =>
          props.onChange(event.nativeEvent.selectedSegmentIndex === 1 ? "agents" : "threads")
        }
        style={{ height: 32, width: "100%" }}
        testID="threads-agents-segmented-control"
      />
    </View>
  );
}
