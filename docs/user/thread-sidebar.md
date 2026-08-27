# Organizing threads

Pin a thread from its context menu to keep it in the pinned section above your active work.
Pinned threads are shown independently of their project, including when you connect to more than
one environment.

Pinned threads still move to **Settled** when they become inactive. They also move when their pull
request merges if **Auto-settle merged threads** is enabled.

Active threads are ordered by the most recent prompt you sent. A thread with no prompts yet falls
back to when it was created. Agent completions and metadata changes do not move a thread by
themselves. Un-settling a thread also returns it to the top of the active list so you can find it
right away; its other timestamps do not change.

Right-click a pull request link in a thread and choose **Link to thread** to show that pull request
in the sidebar. The thread settles when the linked pull request merges if **Auto-settle merged
threads** is enabled. Right-click the same link and choose **Unlink from thread** to remove it.

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

Threads in the split are grouped together in the sidebar inside a dotted green border. Clicking a
thread outside that group opens it by itself and keeps the split ready in the sidebar. Click any
grouped thread to return to the full split with that thread focused. Creating another split replaces
the previous saved group; one split group is kept at a time. The saved group appears in the sidebar
of every open desktop window, while each window keeps its own currently visible panes and focused
thread.

Drag pane headers onto one another to swap them, or drag a header into the grid's empty slot to move
it. Pane dividers can be resized and double-clicked to return to an even split. Double-click a pane
header to maximize or restore it. An unfocused pane keeps its conversation header in place at
reduced opacity, so switching panes does not move the conversation content.

The right panel stays docked to the right side of the full workspace rather than opening inside an
individual pane. Its width can be resized while the remaining space is redistributed across the
thread panes. Once open, the panel stays open as focus moves between panes; a thread with no panel
tabs shows the surface launcher. Each thread keeps its own Files, Diff, Terminal, Browser, Pull
request, and Agents tabs.

In **Files**, use the branch menu above the file tree to inspect committed files from another
branch. **Working tree** is the normal editable view. Branch views are read-only and do not switch
the checked-out branch, change the worktree, or alter the thread's agent session.

Closing a pane closes only that view. It does not stop, settle, archive, or delete the thread. When
only one pane remains, the group dissolves. Pane arrangement and the saved group are session-only
and return to one thread when the desktop app reloads or restarts.

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
