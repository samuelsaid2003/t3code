import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { ThreadRouteTarget } from "../../threadRoutes";
import { SidebarInset } from "../ui/sidebar";
import { ThreadWorkspace } from "./ThreadWorkspace";

type RouteTargetRegistration = {
  readonly id: symbol;
  readonly target: ThreadRouteTarget;
};

const ThreadWorkspaceRouteContext = createContext<
  ((target: ThreadRouteTarget) => () => void) | null
>(null);

export function ThreadWorkspaceHost({ children }: { readonly children: ReactNode }) {
  const [registration, setRegistration] = useState<RouteTargetRegistration | null>(null);
  const register = useCallback((target: ThreadRouteTarget) => {
    const id = Symbol("thread-workspace-route");
    setRegistration({ id, target });
    return () => {
      setRegistration((current) => (current?.id === id ? null : current));
    };
  }, []);

  return (
    <ThreadWorkspaceRouteContext.Provider value={register}>
      {children}
      {registration ? (
        <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
          <ThreadWorkspace routeTarget={registration.target} />
        </SidebarInset>
      ) : null}
    </ThreadWorkspaceRouteContext.Provider>
  );
}

export function ThreadWorkspaceRouteTarget({ target }: { readonly target: ThreadRouteTarget }) {
  const register = useContext(ThreadWorkspaceRouteContext);
  const targetRef = useRef(target);
  targetRef.current = target;
  const targetKey =
    target.kind === "draft"
      ? `draft:${target.draftId}`
      : `server:${target.threadRef.environmentId}:${target.threadRef.threadId}`;

  useLayoutEffect(() => {
    if (register === null) {
      throw new Error("ThreadWorkspaceRouteTarget must be rendered inside ThreadWorkspaceHost.");
    }
    return register(targetRef.current);
  }, [register, targetKey]);

  return null;
}
