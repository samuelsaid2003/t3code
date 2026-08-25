import { createContext, useContext, type ReactNode } from "react";

export type ThreadWorkspaceRightPanelPresentation = {
  readonly ownerKey: string;
  readonly maximized: boolean;
};

export function updateThreadWorkspaceRightPanelPresentation(
  current: ThreadWorkspaceRightPanelPresentation | null,
  ownerKey: string,
  maximized: boolean | null,
): ThreadWorkspaceRightPanelPresentation | null {
  if (maximized === null) {
    return current?.ownerKey === ownerKey ? null : current;
  }
  return { ownerKey, maximized };
}

type ThreadWorkspaceRightPanelPortalValue = {
  readonly target: HTMLElement | null;
  readonly resizeContainer: HTMLElement | null;
  readonly isOpen: boolean;
  readonly show: () => void;
  readonly close: () => void;
  readonly reportPresentation: (ownerKey: string, maximized: boolean | null) => void;
};

const ThreadWorkspaceRightPanelPortalContext =
  createContext<ThreadWorkspaceRightPanelPortalValue | null>(null);

export function ThreadWorkspaceRightPanelPortalProvider(props: {
  readonly value: ThreadWorkspaceRightPanelPortalValue;
  readonly children: ReactNode;
}) {
  return (
    <ThreadWorkspaceRightPanelPortalContext.Provider value={props.value}>
      {props.children}
    </ThreadWorkspaceRightPanelPortalContext.Provider>
  );
}

export function useThreadWorkspaceRightPanelPortal(): ThreadWorkspaceRightPanelPortalValue | null {
  return useContext(ThreadWorkspaceRightPanelPortalContext);
}
