export type ThreadComposerPresentation = "collapsed" | "expanded" | "fullscreen";

export const FULLSCREEN_COMPOSER_EDGE_GAP = 8;

export function resolveThreadComposerPresentation(input: {
  readonly editorFocused: boolean;
  readonly fullscreenRequested: boolean;
  readonly settingsActive: boolean;
}): ThreadComposerPresentation {
  if (input.fullscreenRequested) return "fullscreen";
  if (input.editorFocused || input.settingsActive) return "expanded";
  return "collapsed";
}

export function resolveFullscreenComposerSurfaceHeight(input: {
  readonly windowHeight: number;
  readonly keyboardHeight: number;
  readonly fallbackKeyboardHeight: number;
  readonly safeAreaTop: number;
  readonly minimumSurfaceHeight: number;
}): number {
  const keyboardHeight =
    input.keyboardHeight > 0 ? input.keyboardHeight : input.fallbackKeyboardHeight;
  return Math.max(
    input.minimumSurfaceHeight,
    input.windowHeight - keyboardHeight - input.safeAreaTop - FULLSCREEN_COMPOSER_EDGE_GAP * 2,
  );
}
