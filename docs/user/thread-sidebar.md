# Organizing threads

Pin a thread from its context menu to keep it in the pinned section above your active work.
Pinned threads are shown independently of their project, including when you connect to more than
one environment.

Pinned threads still move to **Settled** when they become inactive. They also move when their pull
request merges if **Auto-settle merged threads** is enabled.

On web and desktop, drag a pinned thread to change its position. On mobile, open the thread's menu
and choose **Move up** or **Move down**. The order is stored by the server and appears on your
other connected devices.

If reordering is unavailable for one environment, update the T3 Code server running in that
environment. Older servers can still pin and unpin threads, but do not understand synced ordering;
their pinned threads keep the default newest-first order below the ones you have arranged.

## Viewing multiple threads on desktop

In the desktop app, drag a thread from the sidebar toward an edge of the conversation area to open
it beside the current thread. T3 Code supports two columns, two rows, or a four-slot grid with up
to four visible threads.

Clicking a thread in the sidebar still opens it in the focused pane. Drag pane headers onto one
another to swap them, or drag a header into the grid's empty slot to move it. Pane dividers can be
resized and double-clicked to return to an even split. Double-click a pane header to maximize or
restore it.

Closing a pane closes only that view. It does not stop, settle, archive, or delete the thread. Pane
arrangement is session-only and returns to one thread when the desktop app reloads or restarts.

## Environment artwork

Dev and Nightly environments can identify themselves with artwork at the top of the sidebar and in
the send button. Choose **Artwork**, **Version pill**, or **None** in Settings under environment
identification. Artwork is recolored to match each built-in theme. Custom themes use the **Version
pill** fallback because their colors are not controlled by T3 Code.

To generate a fresh title from the conversation, open a thread's context menu and choose
**Regenerate title**. While T3 Code is generating it, the action reads **Regenerating…** and cannot
be selected again. The option is hidden when the connected environment needs a server update.

On desktop, **File → New Window** (`Cmd+Shift+N` on macOS, `Ctrl+Shift+N` elsewhere) opens another
window against the same backend. **Open Thread in New Window** in a thread's context menu does the
same with that thread already selected. Each window keeps its own route and UI state.
