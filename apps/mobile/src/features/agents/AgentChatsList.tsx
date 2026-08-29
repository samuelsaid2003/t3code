import { LegendList } from "@legendapp/list/react-native";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import {
  threadSearchMatchKey,
  type EnvironmentThreadSearchMatch,
} from "@t3tools/client-runtime/state/thread-search";
import type { SavedRemoteConnection } from "../../lib/connection";
import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { ProjectFavicon } from "../../components/ProjectFavicon";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/time";
import { themeColorWithAlpha } from "../../lib/mobileTheme";
import { useUniwindTheme } from "../../lib/useUniwindTheme";
import { useThreadSearch } from "../../state/queries";
import { useWorkspaceState } from "../../state/workspace";
import { ThreadSearchMatchExcerpt } from "../threads/thread-search-match";
import { resolveThreadStatus } from "../threads/threadPresentation";
import { mobileThreadShellKey, sortAgentThreadShells } from "./agent-chat-navigation";

export interface AgentChatsListProps {
  readonly agents: ReadonlyArray<EnvironmentThreadShell>;
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly savedConnectionsById: Readonly<Record<string, SavedRemoteConnection>>;
  readonly searchQuery: string;
  readonly selectedThreadKey?: string | null;
  readonly variant: "compact" | "sidebar";
  readonly onSelectAgent: (thread: EnvironmentThreadShell) => void;
}

export function AgentChatsList(props: AgentChatsListProps) {
  const { environments } = useWorkspaceState();
  const searchEnvironmentIds = useMemo(
    () =>
      environments
        .filter((environment) => environment.connectionState === "connected")
        .map((environment) => environment.environmentId),
    [environments],
  );
  const threadSearch = useThreadSearch(searchEnvironmentIds, props.searchQuery);
  const searchMatchByKey = useMemo(() => {
    const matches = new Map<string, EnvironmentThreadSearchMatch>();
    for (const match of threadSearch.matches) {
      if (match.source === "user" || match.source === "assistant") {
        matches.set(threadSearchMatchKey(match), match);
      }
    }
    return matches;
  }, [threadSearch.matches]);
  const projectByKey = useMemo(
    () =>
      new Map(
        props.projects.map(
          (project) => [`${project.environmentId}:${project.id}`, project] as const,
        ),
      ),
    [props.projects],
  );
  const query = props.searchQuery.trim().toLocaleLowerCase();
  const visibleAgents = useMemo(
    () =>
      sortAgentThreadShells(props.agents).filter((agent) => {
        if (!query) return true;
        const project = projectByKey.get(`${agent.environmentId}:${agent.projectId}`);
        const localMatch = [agent.title, project?.title]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase().includes(query));
        return (
          localMatch ||
          searchMatchByKey.has(
            threadSearchMatchKey({
              environmentId: agent.environmentId,
              threadId: agent.id,
            }),
          )
        );
      }),
    [projectByKey, props.agents, query, searchMatchByKey],
  );
  const renderItem = useCallback(
    ({ item, index }: { readonly item: EnvironmentThreadShell; readonly index: number }) => {
      const project = projectByKey.get(`${item.environmentId}:${item.projectId}`) ?? null;
      return (
        <AgentChatRow
          agent={item}
          environmentLabel={
            Object.keys(props.savedConnectionsById).length > 1
              ? (props.savedConnectionsById[item.environmentId]?.environmentLabel ?? null)
              : null
          }
          isLast={index === visibleAgents.length - 1}
          project={project}
          searchMatch={searchMatchByKey.get(
            threadSearchMatchKey({ environmentId: item.environmentId, threadId: item.id }),
          )}
          searchQuery={props.searchQuery}
          selected={mobileThreadShellKey(item) === props.selectedThreadKey}
          variant={props.variant}
          onPress={props.onSelectAgent}
        />
      );
    },
    [
      projectByKey,
      props.onSelectAgent,
      props.savedConnectionsById,
      props.searchQuery,
      props.selectedThreadKey,
      props.variant,
      searchMatchByKey,
      visibleAgents.length,
    ],
  );
  const insets = useSafeAreaInsets();
  const emptyMessage =
    props.agents.length === 0
      ? "Create an Agent Chat from T3 Code on your desktop."
      : threadSearch.isPending && query
        ? "Searching Agent Chats…"
        : "No matching Agent Chats";

  return (
    <LegendList
      data={visibleAgents}
      drawDistance={400}
      estimatedItemSize={66}
      keyExtractor={mobileThreadShellKey}
      renderItem={renderItem}
      recycleItems
      showsVerticalScrollIndicator={false}
      className={props.variant === "compact" ? "flex-1 bg-screen" : "flex-1 bg-drawer"}
      contentContainerStyle={{
        flexGrow: visibleAgents.length === 0 ? 1 : undefined,
        paddingBottom: Math.max(insets.bottom, 16) + 24,
        paddingHorizontal: props.variant === "sidebar" ? 8 : 0,
      }}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center px-8 py-16">
          <View className="mb-3 size-11 items-center justify-center rounded-full bg-subtle">
            <SymbolView
              name={{ ios: "sparkles", android: "auto_awesome" }}
              size={20}
              tintColorClassName="accent-icon-muted"
              type="monochrome"
            />
          </View>
          <Text className="max-w-[280px] text-center text-sm leading-5 text-foreground-muted">
            {emptyMessage}
          </Text>
        </View>
      }
    />
  );
}

const AgentChatRow = memo(function AgentChatRow(props: {
  readonly agent: EnvironmentThreadShell;
  readonly environmentLabel: string | null;
  readonly isLast: boolean;
  readonly project: EnvironmentProject | null;
  readonly searchMatch?: EnvironmentThreadSearchMatch;
  readonly searchQuery: string;
  readonly selected: boolean;
  readonly variant: "compact" | "sidebar";
  readonly onPress: (thread: EnvironmentThreadShell) => void;
}) {
  const theme = useUniwindTheme();
  const compact = props.variant === "compact";
  const status = resolveThreadStatus(props.agent);
  const selectedForeground = theme["--color-user-bubble-foreground"];
  const subtitle = [props.project?.title, props.environmentLabel]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  const timestamp = relativeTime(
    props.agent.latestUserMessageAt ?? props.agent.updatedAt ?? props.agent.createdAt,
  );

  return (
    <Pressable
      accessibilityHint="Opens this Agent Chat"
      accessibilityLabel={`Agent Chat: ${props.agent.title}`}
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected }}
      onPress={() => props.onPress(props.agent)}
      style={({ pressed }) => ({
        backgroundColor: props.selected
          ? theme["--color-user-bubble"]
          : pressed
            ? theme["--color-subtle"]
            : compact
              ? theme["--color-screen"]
              : theme["--color-drawer"],
        borderRadius: compact ? 0 : 12,
        minHeight: compact ? 70 : 64,
        paddingLeft: compact ? 20 : 12,
        paddingRight: compact ? 18 : 12,
        paddingTop: 10,
      })}
    >
      <View
        className="flex-row items-start gap-3"
        style={{
          borderBottomColor: theme["--color-separator"],
          borderBottomWidth: compact && !props.isLast ? StyleSheet.hairlineWidth : 0,
          paddingBottom: 10,
        }}
      >
        <View className="mt-0.5 size-8 items-center justify-center rounded-full bg-subtle">
          {props.project ? (
            <ProjectFavicon
              environmentId={props.project.environmentId}
              faviconPath={props.project.faviconPath}
              projectTitle={props.project.title}
              size={18}
              workspaceRoot={props.project.workspaceRoot}
            />
          ) : (
            <SymbolView
              name={{ ios: "sparkles", android: "auto_awesome" }}
              size={16}
              tintColorClassName="accent-icon-muted"
              type="monochrome"
            />
          )}
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text
              className={cn(
                "min-w-0 flex-1 font-t3-bold",
                compact ? "text-lg" : "text-base",
                props.selected ? "text-user-bubble-foreground" : "text-foreground",
              )}
              numberOfLines={1}
            >
              {props.agent.title}
            </Text>
            {status ? (
              <View
                className={cn("rounded-full px-1.5 py-0.5", status.pillClassName)}
                style={
                  props.selected
                    ? { backgroundColor: themeColorWithAlpha(String(selectedForeground), 0.18) }
                    : undefined
                }
              >
                <Text
                  className={cn(
                    "text-3xs font-t3-bold",
                    props.selected ? "text-user-bubble-foreground" : status.textClassName,
                  )}
                >
                  {status.label}
                </Text>
              </View>
            ) : null}
            <Text
              className={cn(
                "tabular-nums",
                compact ? "text-base" : "text-xs",
                props.selected ? "text-user-bubble-foreground-muted" : "text-foreground-tertiary",
              )}
            >
              {timestamp}
            </Text>
          </View>
          {props.searchMatch ? (
            <ThreadSearchMatchExcerpt
              compact={compact}
              match={props.searchMatch}
              query={props.searchQuery}
              selected={props.selected}
            />
          ) : null}
          {subtitle ? (
            <Text
              className={cn(
                compact ? "text-sm" : "text-xs",
                props.selected ? "text-user-bubble-foreground-muted" : "text-foreground-muted",
              )}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});
