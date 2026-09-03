# Organizing threads

Pin a thread from its context menu to keep it in the pinned section above your active work.
`mod+shift+p` pins or unpins the thread you have open. Pinned threads are shown independently of
their project, including when you connect to more than one environment.

To require confirmation before unpinning, enable **Settings → General → Unpin confirmation**. The
confirmation applies to the sidebar controls, thread menus, and the `mod+shift+p` shortcut.

Pinned threads still move to **Settled** when they become inactive. They also move when their pull
request merges if **Auto-settle merged threads** is enabled.

Active threads are ordered by the most recent prompt you sent. A thread with no prompts yet falls
back to when it was created. Agent completions and metadata changes do not move a thread by
themselves. Un-settling a thread also returns it to the top of the active list so you can find it
right away; its other timestamps do not change.
Each server stores its own copy of the automatic settlement settings and checks them even when no
web, desktop, or mobile client is connected. By default, it settles threads after three days without
activity and when their pull request merges. An eligible idle thread also settles when its pull
request closes. An open pull request blocks inactivity settlement. Active work, pending input, and
live background work keep the thread active. T3 Code settles from a closed or merged pull request
only when its timestamp is not older than the user's latest activity. If that timestamp is not
available, the inactivity rule still applies. A manual un-settle also keeps the thread active.

**Settled** lists threads by when their work finished, newest first. A thread you settle yourself
sorts by the moment you settled it. A thread that settled on its own sorts by its last message or
turn, not by when the server noticed it was inactive.

Change these rules in **Settings > General**. The change is written to every connected environment
whose server supports shared settings. An environment that is offline or needs a server update
keeps its old value and does not appear in mismatch warnings. When a connected environment whose
server supports shared settings holds a different value, **Settings > General** shows a warning
that names it. Choose **Apply to all** to write your current values to the environments named in
the warning. The same applies to the new-thread workspace mode and the source control writing
style.

A settings change affects future settlement and does not reopen a settled thread. Settings saved
by older clients on one device no longer control this behavior.

When you un-settle a thread, it returns to the top of the active list so you can find it right
away. Its timestamps do not change. Other threads keep their positions.

Right-click a pull request link in a thread and choose **Link to thread** to show that pull request
in the sidebar. The thread settles when the linked pull request merges if **Auto-settle merged
threads** is enabled. Right-click the same link and choose **Unlink from thread** to remove it.

On web and desktop, drag a pinned thread to change its position. On mobile, open the thread's menu
and choose **Move up** or **Move down**. The order is stored by the server and appears on your
other connected devices.

If reordering is unavailable for one environment, update the T3 Code server running in that
environment. Older servers can still pin and unpin threads, but do not understand synced ordering;
their pinned threads keep the default newest-first order below the ones you have arranged.

## Switching threads on iPhone

While a chat is open on iPhone, touch the subtle glass notch on the right edge and drag up or down.
The notch expands into a wheel of recent conversation titles that moves with your finger. Release
when the thread you want is centered to open it; tap without dragging to expand or collapse the
wheel. The notch follows the current Threads or Agents mode and is hidden while viewing Tasks.
VoiceOver exposes next, previous, and wheel actions on the same control.

## Viewing multiple threads on desktop

In the desktop app, drag a thread from the sidebar toward an edge of the conversation area to open
it beside the current thread. T3 Code supports two columns, two rows, or a four-slot grid with up
to four visible threads.

Threads in the split are grouped together in the sidebar inside a dotted green border. Clicking a
thread outside that group opens it by itself and keeps the split ready in the sidebar. Click any
grouped thread to return to its full split with that thread focused. You can keep multiple split
groups at once; creating another split adds another dotted group instead of replacing the existing
ones. Saved groups appear in the sidebar of every open desktop window, while each window keeps its
own currently visible panes and focused thread.

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
only one pane remains, that group dissolves without affecting other saved groups. Pane arrangements
and saved groups are session-only and return to one thread when the desktop app reloads or restarts.

## Panel motion

The main sidebar, right panel, and terminal drawer open and close immediately by default. Under
**Settings → Appearance → Motion**, move the **Panel animations** slider above 0 ms to add motion.
The duration can be set up to 400 ms. Clicking the preview replays all three panel transitions; at
0 ms, it snaps between the same open and closed states.

## Environment icons

When you are connected to more than one environment, every thread that lives somewhere other than
the machine you are on wears a small icon for that machine at the end of its row: a server, a cloud
VM, a desktop, a laptop, a Mac mini, or a Mac Studio. In the hosted web app and the mobile app,
where every environment is remote, each row wears its machine so you can tell them apart at a
glance. The same icon appears wherever an environment is named: the thread tooltip, the command
palette, the "Run on" picker, the pull request server filter, the provider settings device tabs,
and the environment lists under **Settings → Connections**. On mobile it appears in the thread
lists, the archive, the new-task environment picker, and the Environments and storage settings.

Servers pick the icon themselves from the hardware they run on. A Mac reports its model, a Linux
machine reports its chassis type and whether it is a virtual machine, and anything without a usable
signal shows a generic server. To override it, open **Settings → Connections** and choose an icon
for that environment; **Automatic** goes back to what the server detected. The choice is stored on
that server, so every device that connects to it sees the same icon.

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
