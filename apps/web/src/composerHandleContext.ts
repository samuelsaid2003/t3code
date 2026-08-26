import { createContext, use } from "react";
import type { ChatComposerHandle } from "./components/chat/ChatComposer";

export type ComposerHandleRef = React.RefObject<ChatComposerHandle | null>;

export const ComposerHandleContext = createContext<ComposerHandleRef | null>(null);

export function useComposerHandleContext(): ComposerHandleRef | null {
  return use(ComposerHandleContext);
}

export function publishFocusedComposerHandle(input: {
  globalRef: ComposerHandleRef | null;
  previousHandle: ChatComposerHandle | null;
  nextHandle: ChatComposerHandle | null;
  focused: boolean;
}): void {
  if (!input.globalRef || !input.focused) return;
  if (input.nextHandle !== null) {
    input.globalRef.current = input.nextHandle;
    return;
  }
  if (input.globalRef.current === input.previousHandle) {
    input.globalRef.current = null;
  }
}
