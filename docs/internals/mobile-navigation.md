# Mobile navigation headers

The iOS Home and thread routes share the root native stack in
[`Stack.tsx`](../../apps/mobile/src/Stack.tsx). Keeping them in one navigation
controller lets UIKit animate the header between routes. The iPad sidebar owns
a separate, single-screen stack; Android uses its own in-flow headers.

Home and the iPad sidebar expose a native `Threads | Agents | Tasks` segmented control. The mode
itself is not persisted, so every cold launch begins in Threads unless an Agent deep link opens a
chat. Search text is kept independently for each list. On iPad a conversation-mode change navigates
directly to that mode's remembered selection; Tasks replaces the detail with its shared list. On
iPhone the control replaces only the Home list. Keep the underlying complete thread collection
mounted in synchronization and cursor state—filter only the visual selectors.

An iOS chat detail also mounts a narrow right-safe-area notch. Its pan gesture considers only active
standard threads or Agent Chats from the selected mode, sorted by recency. Touching it expands the
notch itself into a clipped vertical title wheel. The wheel follows the finger on the UI thread,
ticks once for each crossed row, projects a short release velocity, snaps the chosen row to center,
then replaces the current Thread route and collapses. A tap expands or collapses the same wheel;
there is no separate picker or preview surface. Recent candidates are bounded for render cost while
always retaining the current thread. VoiceOver exposes previous, next, and wheel activation on the
same adjustable control. Tasks mode never mounts the notch. The resting tab and the expanded wheel
are one continuous surface: a single rounded shape that overhangs the screen edge so its visible
corners dissolve into the edge instead of forming a floating pill. Supported iOS versions render it
with native Liquid Glass; older versions receive a single-color translucent fallback.

Home and the iPad sidebar render their brand and connection status through
`headerTitle`, with `Threads` retained as the route title. The editor-style native
bar aligns that title on the leading side. Do not model the brand as a toolbar
button: on iOS 26.5 UIKit morphs a background-free custom leading item's rectangle
into the next screen's glass back button, even with distinct item identifiers.
Using the title slot lets the brand and native back button animate separately.

The connection-status title has a maximum width based on its header's width and
trailing actions. A long environment name or larger text must not push Settings
into UIKit's overflow menu. Keep the full status as the accessibility label
while visually truncating it. The iPad sidebar uses its pane width, not the full
window width.

On iOS 26, UIKit does not recognize Fabric's custom text views when shaping the
native scroll-edge fade. The screens patch gives custom title subviews an empty,
non-interactive native label matching their bounds. This supplies the fade's
geometry without drawing anything or turning the title back into a toolbar item.
Check the top scroll fade as well as push/pop when changing these title views.

The react-native-screens patch caches leading, trailing, and center item groups
independently. A button can belong to only one group: constructing another group
with the same button removes it from the previous one. Unrelated menu updates
must therefore preserve the other groups while UIKit may be animating them.

Each cache includes the owning header config, its item values, and custom native
item identities, so changed content or remounted event emitters still rebuild.

Custom header identifiers require native code generation and a new mobile build;
an over-the-air JavaScript update alone is insufficient. The Android view manager
implements the generated identifier setter as a no-op because this behavior is
specific to iOS 26 and later.

After changing a dependency patch, refresh CocoaPods before rebuilding an
existing iOS project. pnpm installs each patch hash in a different directory;
an old Pods project can keep compiling the previous directory even though Metro
and `apps/mobile/node_modules` resolve to the new patch.
