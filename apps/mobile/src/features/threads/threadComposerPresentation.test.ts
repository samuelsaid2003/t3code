import { describe, expect, it } from "vite-plus/test";

import {
  FULLSCREEN_COMPOSER_EDGE_GAP,
  resolveFullscreenComposerSurfaceHeight,
  resolveThreadComposerPresentation,
} from "./threadComposerPresentation";

describe("resolveThreadComposerPresentation", () => {
  it("uses the compact pill while the editor and settings are inactive", () => {
    expect(
      resolveThreadComposerPresentation({
        editorFocused: false,
        fullscreenRequested: false,
        settingsActive: false,
      }),
    ).toBe("collapsed");
  });

  it("keeps the ordinary expanded card while typing or changing settings", () => {
    expect(
      resolveThreadComposerPresentation({
        editorFocused: true,
        fullscreenRequested: false,
        settingsActive: false,
      }),
    ).toBe("expanded");
    expect(
      resolveThreadComposerPresentation({
        editorFocused: false,
        fullscreenRequested: false,
        settingsActive: true,
      }),
    ).toBe("expanded");
  });

  it("gives an explicit full-screen request precedence", () => {
    expect(
      resolveThreadComposerPresentation({
        editorFocused: false,
        fullscreenRequested: true,
        settingsActive: false,
      }),
    ).toBe("fullscreen");
  });
});

describe("resolveFullscreenComposerSurfaceHeight", () => {
  it("fills the space above the keyboard while preserving equal edge gaps", () => {
    expect(
      resolveFullscreenComposerSurfaceHeight({
        windowHeight: 800,
        keyboardHeight: 305,
        fallbackKeyboardHeight: 300,
        safeAreaTop: 59,
        minimumSurfaceHeight: 140,
      }),
    ).toBe(420);
    expect(FULLSCREEN_COMPOSER_EDGE_GAP).toBe(8);
  });

  it("uses a stable fallback before native keyboard geometry arrives", () => {
    expect(
      resolveFullscreenComposerSurfaceHeight({
        windowHeight: 800,
        keyboardHeight: 0,
        fallbackKeyboardHeight: 305,
        safeAreaTop: 59,
        minimumSurfaceHeight: 140,
      }),
    ).toBe(420);
  });

  it("never shrinks below the ordinary expanded composer", () => {
    expect(
      resolveFullscreenComposerSurfaceHeight({
        windowHeight: 400,
        keyboardHeight: 300,
        fallbackKeyboardHeight: 300,
        safeAreaTop: 50,
        minimumSurfaceHeight: 140,
      }),
    ).toBe(140);
  });
});
