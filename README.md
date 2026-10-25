# Derq Team Command Center

Derq’s team leadership workspace for daily assignments, strengths and coaching focus, capacity, one-to-one notes, and team bonding activities. The server stores the shared workspace; each browser can also keep a saved copy and pending edits for offline use.

## Derq leadership dashboard

The blue command center has a text-only workspace header and includes clickable summary tiles that open team, active, blocked, and overdue views. It also includes clickable member cards with active assignments, strengths, growth notes, and the four most recent assignments sorted by work date. The top-right clock shows the browser’s local time and timezone. Delivery and workload visuals use your actual records; no demo members or tasks are added. A clickable execution map shows each task stage, and a seven-day planning chart shows open work by due date. Select any date block to see the tasks due that day, with owners, work dates, status, priority, success criteria, and blockers. Dates with zero tasks show an empty state; completed tasks are excluded to match the chart. The animated team network respects reduced-motion preferences.

Use the leadership action queue to review blocked, overdue, and high-priority work. Check-ins scheduled for today or earlier appear in the coaching queue; update the next date after each conversation. Add success criteria to assignments to clarify the intended outcome. Workload bars compare active task counts and should be discussed alongside each member’s stated capacity.

Existing JSON backups and Docker-volume records remain compatible. This update requires no migration and preserves extra record fields when editing. Rebuild with `docker compose up -d --build` to load the new interface while retaining the existing named volume. Do not delete or recreate the volume. Export a backup before updating a live deployment.

## Quick edits without dialogs

Click a capacity pill to cycle **Balanced → Maximum → Available → Balanced**. Existing “At capacity” records display as “Maximum”; the stored value remains compatible with older backups. Capacity controls work in the team table, dashboard cards, and member profiles.

Type strengths, growth focus, or notes directly in the team table or profile. Changes save when you leave the field; **Ctrl/Cmd+Enter** saves immediately and **Esc** cancels the current text edit. Set check-in dates directly in place.

Click task status to cycle **To do → In progress → Blocked → Done → To do**, click priority to cycle **Medium → High → Low**, or use the due-date picker directly. The server-save indicator confirms persistence; offline edits are saved on this device, and conflicts open a field-by-field reconciliation screen. The full Edit dialog is still available for other fields.

## Leave calendar and daily reminders

**Calendar** in the sidebar shows a full month, with previous/next navigation and a return to the current month. Select a date, check the members on leave, and save. Their names remain on that date after reloads and server restarts. Reopen the date and uncheck names to remove leave. Leave records are included in JSON exports; backups from earlier versions without leave records remain supported.

Set each member’s next one-to-one **date and local time** in Team & growth or their profile. Today’s names and times appear beside the clock. Select the reminder strip to see the list or manage scheduling. A “Soon” label appears in the 15 minutes before a scheduled meeting. These are in-app reminders while the page is open, using the browser’s local timezone.

The rounded task indicator opens **all open tasks due today**. Its color counts tasks due today that were **not created today**: green for zero, orange for one or two, red for three or more. Tasks created and due today appear in the list but do not raise the color. New tasks record their creation date independently of work date; changing a work date does not reset creation. Older records lack that metadata, so their existing work/assignment date is used as the fallback. Completed tasks are excluded. The header updates as tasks and check-ins change and as the local day changes.

The existing Docker data file is read without a forced migration. Leave records are added only when saved, preserving existing members, assignments, activities, and extra record fields.

## AI button and built-in commands — no API key

Select the floating **robot icon** at the bottom right to open **Derq AI**. The button has no text badge. Built-in command mode works immediately: no API key, account, model download, or external AI service is needed. It interprets supported command formats on your own server; it is not a general AI chatbot. Type **help** or select **All commands** for examples.

Send one complete command at a time:

- `Add Maya Rao as a Deployment and Configuration Engineer`
- `Mark Maya Rao on leave on 2026-10-26 and 2026-10-28`
- `Mark Maya Rao on leave from 2026-10-26 to 2026-10-28`
- `Remove leave for Maya Rao on 2026-10-26`
- `Assign "Deployment checklist" to Maya Rao, due tomorrow, high priority`
- `Set task "Deployment checklist" status to done`
- `Set task "Deployment checklist" due date to tomorrow`
- `Set Maya Rao's capacity to maximum`
- `Set strengths for Maya Rao to Mentoring and troubleshooting`
- `Set growth focus for Maya Rao to Ownership`
- `Schedule a one-to-one with Maya Rao tomorrow at 10:30 AM`
- `Plan activity "Team lunch" for Maya Rao on tomorrow, type Team bonding`
- `Append a note for Maya Rao: Lead the next handover`
- `Append a note for activity "Team lunch": Bring snacks`
- `Show tasks due tomorrow`, `Show Maya Rao's profile`, or `Who is off today`
- `Open calendar`, `Export backup`, or `Import backup`
- `Delete member Maya Rao` (requires confirmation)

Dates support YYYY-MM-DD, named months (for example `October 28 2026`), today, tomorrow, and weekdays, using the browser's local date. An explicit leave range includes both endpoints; two listed dates mark only those dates. Numeric slash dates are rejected as ambiguous. Dates without a year use the next occurrence; include the year when recording past leave. Times accept `10:30 AM` or `14:30`. Use full member names and quoted task/activity titles. A unique first name is accepted; duplicate names need the role in parentheses or exact record ID. Duplicate task titles can be qualified with `for Maya Rao`. If details are missing or ambiguous, no changes are made: resend the complete command with the requested details. Commands do not infer references such as “him” from earlier messages.

Commands create, update, and delete members, tasks, and activities; set/remove leave; edit capacity, strengths, growth focus, notes, and check-ins; and open workspace views. Task updates support title, status, priority, due date, work date, owner, blocker, and outcome. Activity updates support title, type, owner, date, status, and notes. `Assign` updates an existing unique task title or creates a new task; `Add task` explicitly creates one. Notes can be appended without replacing existing notes. Imports still require choosing a file and accepting the existing replacement confirmation.

Deletions receive a separate confirmation; other explicit commands apply directly. **Undo this change** restores the preceding snapshot for up to ten minutes if no newer edits would be overwritten. Confirmations and Undo expire on server restart; saved records remain in the Docker volume. Commands are validated and saved atomically with revision checks. Creation metadata and unknown existing fields are preserved. Built-in mode sends no requests to an AI provider, even if an API key happens to be present. Chat history stays only in the current page until reload. The assistant cannot execute shell commands, fetch arbitrary URLs, or directly access files. The shared limit is 120 built-in commands per minute.

### Optional external AI mode

For more flexible language and general team questions, explicitly set `DERQ_ASSISTANT_MODE=ai` and provide `DERQ_AI_API_KEY` securely in the server environment (or the existing ignored Compose `.env`, preserving other settings), then restart/rebuild. An OpenAI API key with API billing is required only for this optional mode. `DERQ_AI_MODEL` defaults to `gpt-4.1-mini`. Keep `DERQ_ASSISTANT_MODE=local` for key-free commands; this is the default.

External mode uses OpenAI's structured Responses API, with storage disabled. Commands and relevant workspace context go to OpenAI; member/activity notes and unknown fields are omitted from context. Explicit note commands are still sent as part of your message. The panel shows the active mode and privacy information. There is a shared limit of 20 AI commands per minute, one active call at a time, and a 45-second provider timeout. Never commit credentials or enter them in chat. Validate a new key with a read-only member-count question before issuing changes. Everyone who can access the shared workspace can use its assistant.

## Workspace notepad

Select the **notebook icon above the robot** for a plain-text notepad. Capture ideas, reminders, or anything that does not fit an assignment. Notes save automatically after a short typing pause, when you leave the field, or when you close the panel. **Save now** or **Ctrl/Cmd+Enter** saves immediately. The save status confirms persistence; **Download .txt** saves a plain-text copy, including unsaved text if the server is unavailable. Escape closes either floating panel.

This is a shared workspace note, visible to everyone accessing this deployment. It supports up to 100,000 characters, preserves line breaks, and is included in JSON exports/imports and the existing Docker volume. Reload to see another session's edits. Conflicting saves preserve both versions for explicit reconciliation; the download button can also recover local text. Older workspaces and backups without a notepad remain compatible. Notepad contents are excluded from the optional external AI context.

## Offline editing and reconciliation

Connect once to load the workspace. The app saves a local copy and edit draft in IndexedDB (with browser-storage fallback). Members, tasks, dependencies, leave, availability observations, and notepad text can be edited offline. The header distinguishes saving, a saved offline copy, pending changes, and conflicts. The server remains the shared source after reconciliation; offline edits are not visible on other devices until they sync.

On reconnection the app compares the original shared snapshot, this device's edits, and the latest server state. Independent records and fields merge automatically. Conflicting fields, deletion-versus-edit changes, and inconsistent task relationships require explicit choices. Select the save indicator to inspect **Offline & reconciliation**, compare original/local/server versions, retry, export a backup, or recover another saved device draft. Choices are rechecked against the latest server revision before saving. No server version is overwritten with a stale whole-workspace snapshot. A conflict can require a further review when choosing one version exposes another relationship conflict.

**Offline reload requires HTTPS or localhost**, an initial successful visit, and a ready service-worker cache. The sync dialog shows readiness. On an ordinary HTTP LAN address, an already-open page supports offline editing, but browsers do not permit offline reload through a service worker. Use the same browser profile and address for recovery. AI commands still require a connection to the app server and wait for pending edits to sync. Clearing site data, private-browsing expiry, storage quotas, or browser eviction can remove saved device copies: export important drafts. A storage failure is shown explicitly; it does not falsely report durable offline saving.

Each document has its own draft writer ID so tabs cannot silently replace one another's cached edits. Reopening a pending draft copies it before retiring an unchanged source. Pending drafts from other tabs can be recovered from the sync dialog. Open forms and uncommitted text edits pause adoption of remote changes. The server checks the revision again on every save. This deployment still uses one application server against the existing JSON data file and Docker volume.

Device copies include shared workspace notes and remain readable by other people using the same browser profile. **Clear saved device copies** removes synced browser copies when there are no pending drafts; it does not delete server records or pending drafts. With fallback browser storage, it clears this tab’s copy; browser site settings can clear all app storage. Other open tabs can save new copies. Browser backups are a separate export, not a substitute for server backups. Imports replace local records and reconcile concurrent server edits before syncing.

## Team Activity: 3D globe and dependency map

**Team Activity** opens an illuminated 3D constellation: a shaded sphere, 14,500 terrain/ocean particles, tilted orbital paths, atmospheric glow and curved member connections. It uses native WebGL with a Canvas fallback when GPU rendering is unavailable. Connections represent team membership, not geographic locations. Select a member node or roster entry to inspect actual dated completions from the last seven calendar days. Green marks all members tied for the most completions; orange marks those tied for the fewest. Everyone tied stays blue. Counts indicate volume, not effort or quality.

Drag to turn the globe with inertia; scroll or pinch to zoom. Focus the scene and use arrow keys, `+`/`−`, Space (pause) and Home (reset). Small pause/reset icons replace the previous rotate/orbit button row. Member nodes remain legible and page through groups of eight, or four in compact scenes; the roster lists everyone. Motion pauses when the scene is offscreen or the document is hidden. The browser's reduced-motion setting disables automatic movement and interface animation. The scene, palette, drawers and analytics work with cached workspace data offline, without graphics libraries, CDNs or external services.

Switch to **Dependency map** to inspect prerequisite arrows and the people owning each task. Select a task to highlight its prerequisite and downstream impact. In the task editor, use **Depends on** to select prerequisite tasks; cycles, self-links, and missing prerequisites are rejected. Removing a task removes its incoming references. A dependency is a planning relationship; it does not prevent a leader from manually changing task status.

## Persistent details and workspace search

Member profiles, task details, completed-task lists and due-date lists open in a modeless detail drawer. Keep it open while changing pages; wide screens make room beside the current view, and small screens use a full-width detail panel. Back returns to earlier details. Escape or Close dismisses it. New-record forms and Calendar leave selection retain their focused forms.

Open a task from its title, an Edit action, a dependency or search. Change title, owner, work/due/completion dates, blockers and expected impact directly in the drawer; status and priority cycle in place. Changes use the existing validation, completion stamps, local draft storage and reconciliation. Uncommitted task text pauses remote adoption; invalid edits are flagged and require correction or an explicit discard before switching. **Edit dependencies & all fields** opens the full editor.

Select **Search anything** or press `Ctrl/Cmd + K`. Search member names, roles, strengths, task titles/owners/status/due dates, activities and workspace actions. Prefix `@` for members, `#` for tasks or `>` for actions. Use arrows and Enter to select, or Escape to close. Actions navigate, create records, open AI/notepad or export a backup. Search is local and works offline. Finish an open create/edit or Calendar form before using search to switch contexts.

## Completion history and presentation

Marking a task **Done** records its local completion date and credited member. Reopening it clears that completion. Reassignment after completion retains the original completion credit. The **Completion date** field lets you backfill older completed tasks or correct a date; no past completion date is inferred from assignment dates. Older completed tasks without dates are counted separately and excluded from dated graphs and rankings.

Selecting any member card shows a **15-day line chart** of daily dated completions. Select a point for that day's task list.

The app records declared capacity on the current day when loaded/edited and at a local-day change while open; capacity changes update that day's observation. It does not reconstruct unobserved past days. The availability metric shows days last observed as **Available** divided by observed non-leave days. It is a capacity observation, not attendance or continuous time monitoring. **Leave days (last 30 days)** counts each member's unique recorded Calendar leave dates from 29 days ago through today, independently of the 15-day completion window. Future leave and older dates are excluded; members with no leave in that period show zero. Historical time entries from older versions remain preserved in backups and storage for compatibility, but time logging and time metrics are no longer available.

**Presentation** offers 7-, 15-, 30-, 45-, 50-, 60- and 90-day presets, an end date, and custom date ranges up to 366 days. Filter by member, role, completions, recorded leave, currently blocked work or current overdue work; sort by name, completion count, leave, open work or overdue work. Filters stay selected while navigating within the open page. Reset restores the default 15-day view.

Charts, dated deliveries, leave totals, highlight counts and ranking colors all use the selected period and shown members. A one-day custom range is supported. Leave counts come only from that member's unique recorded Calendar dates within the range, excluding future dates; no records means zero. Cards preview the actual leave dates, and **View recorded leave dates** lets you open and correct Calendar entries. Available/observed days and undated completion counters are omitted from Presentation. Current open, blocked and overdue figures describe workload now, even when reviewing an earlier completion period. Task volume alone does not measure effort or quality.

Fullscreen hides navigation and floating tools; **Exit presentation** or fullscreen Escape restores the interface. **Print / PDF** keeps the filtered review, with a summary of its dates and selected filters. Volume and leave are separate measures.

**Compare with previous period** compares the selected range with the immediately preceding, equally sized range, using the same currently shown members. It shows daily completion curves, recorded completion and leave totals, on-time completion counts, and member changes. Dashed member-chart lines represent the prior period. A zero baseline is labeled instead of displaying infinite percentage growth. Current open/blocked/overdue workload is not represented as a historical measurement. Filtered comparisons are included in Print/PDF.

Interface motion emphasizes navigation, the detail drawer, keyboard search and focus, with subtle hover depth. Reduced-motion preferences apply throughout.

## Leave Impact

**Leave Impact** analyzes a selected calendar date using recorded leave. It flags open assignments due by that date or assigned on/before it, and shows downstream open tasks. Future assignments with no earlier deadline are excluded. Coverage suggestions exclude members on leave that day and members currently at maximum capacity, then sort by exact shared strength labels and current open-task counts. These are transparent heuristics, not estimates of expertise or historical capacity. Reassigning requires a leader's confirmation. The calendar leave editor also previews the impact of a proposed selection before it is saved.

## Clone and deploy locally

Install Git and Docker Desktop (Windows/macOS) or Docker Engine with the Compose plugin (Linux). Start Docker, then run:

```sh
git clone https://github.com/onkartechh/team-tool.git
cd team-tool
docker compose up -d --build
```

Open **http://localhost:3000** in your local browser. Check the deployment:

```sh
docker compose ps
docker compose logs --tail=50 teamspace
```

Compose creates the named volume `teamspace_data`, mounted at `/app/data`. Members, tasks, and activities are written to `teamspace.json` in that volume. Saves use an atomic replacement and flush writes before confirming success. The header shows whether a save succeeded. A failed save displays a message; export your edits before reloading.

## Access from another device

Run Docker on the computer or server that the other device can reach. A private IP inside the Codex cloud workspace is not a public hosting address.

For a phone, tablet, or laptop on the same trusted Wi-Fi/LAN, publish the app on the host’s network interfaces:

```sh
# Linux / macOS
TEAMSPACE_BIND_IP=0.0.0.0 docker compose up -d --build
```

```powershell
# Windows PowerShell
$env:TEAMSPACE_BIND_IP = "0.0.0.0"
docker compose up -d --build
```

Find the host computer’s Wi-Fi/Ethernet IPv4 address (`ipconfig` on Windows, `ipconfig getifaddr en0` for typical macOS Wi-Fi, or `ip -4 addr` on Linux). On the other device, open `http://HOST_LAN_IP:3000`, replacing `HOST_LAN_IP` with that address. Both devices must be on the same reachable network; guest Wi-Fi may isolate devices. If necessary, allow inbound TCP port 3000 only from your private network in the host firewall.

To bind one specific host interface, set `TEAMSPACE_BIND_IP` to its actual LAN IP instead of `0.0.0.0`. `0.0.0.0` means all interfaces; it is not an address to type into a browser. `TEAMSPACE_HOST_PORT` can change the host port if 3000 is occupied. To keep the address stable, reserve the host’s LAN IP in your router’s DHCP settings. These settings change only the published port; the existing `teamspace_data` volume is reused.

For persistent settings, put non-secret `TEAMSPACE_BIND_IP=0.0.0.0` (or the host’s specific IP) in the ignored `.env` file beside `compose.yaml`, preserving any existing entries. Restart with `docker compose up -d`. Without an override, the default remains loopback-only. For internet access, use your own reachable server with an authenticated HTTPS proxy or private VPN; this app has no login, so do not forward port 3000 directly to the public internet.

## Stop, restart, and update

```sh
# Stop and start without deleting records
docker compose stop
docker compose start

# Rebuild after pulling new code; the existing volume is reused
git pull --ff-only origin main
docker compose up -d --build

# Remove containers and network while keeping records
docker compose down
# Restore the deployment using the retained volume
docker compose up -d
```

Records survive container crashes, stops, restarts, and replacement when the volume is reused. **Do not run `docker compose down -v` or delete `teamspace_data` unless you intend to erase the records.** A volume does not protect against disk failure or accidental deletion. Use **Export backup** regularly and keep the downloaded JSON somewhere safe. **Import backup** restores it after confirmation and replaces the shared workspace.

## Deploy without Compose

```sh
docker build -t teamspace .
docker volume create teamspace_data
docker run -d --name teamspace --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v teamspace_data:/app/data teamspace
```

For hosting platforms, attach persistent storage at `/app/data`, set the internal port to **3000**, and run one application instance against that storage. `PORT` and `DATA_DIR` can override these defaults. Docker creates an anonymous volume if you omit the named mount, but it will not automatically be reused by a replacement container: use the named volume or Compose configuration above.

This app has **no login or access control**. The local deployment binds only to your computer. To give your team remote access, put it behind an authenticated HTTPS proxy or private network. Everyone with access can read and change all records. Use the save indicator's reconnect/retry action or reload to fetch other sessions' changes. Pending edits are reconciled with the latest revision. This file-based deployment supports one server instance, not multiple replicas.

## Daily workflow

1. Add members under **Team & growth**. Record strengths, growth focus, capacity, and next check-in.
2. Create daily assignments under **Daily tasks**, with owner, work date, due date, priority, and status.
3. Update progress and blockers. Filter by member, date, or status.
4. Plan bonding, learning, recognition, and retrospectives under **Team connection**. Check off activities and record outcomes.
5. Review the dashboard and revisit coaching goals weekly.

### Moving data from the original browser-only version

Export backup from the original version before updating. After deploying this version, use **Import backup** in the same or another browser to transfer those records to the server. Imports replace server records, so export any existing server workspace first. Old browser localStorage is not automatically uploaded or deleted.

## Develop without Docker

Requires Node.js 18 or newer; there are no third-party packages to install.

```sh
npm start
npm test
```

The server defaults to port 3000 and stores data in the ignored `data/` directory. Set `DATA_DIR` to use another directory. Tests use isolated temporary storage and verify assets, input validation, stale-save rejection, and persistence across server restarts.
