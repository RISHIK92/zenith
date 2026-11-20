# Zenith

**Zenith** is a light-themed desktop productivity and focus platform built with **Electron**, **React**, **TypeScript**, and **SQLite**. It helps students and knowledge workers overcome distractions, collaborate in focus rooms, track sessions and productivity events, and build consistent habits through points, achievements, and transaction logs.

## Architecture: Main Process, Preload Bridge & Renderer Process

Zenith follows Electron's recommended multi-process security model with strict process isolation:

```text
┌───────────────────────────────────────────────────────────────────────────┐
│  Renderer Process (src/ — React + TypeScript + Vite)                      │
│  • Light-themed UI (Dashboard, Focus Timer, Rooms, Blocker, Gamification) │
│  • Sandboxed Chromium context (nodeIntegration: false, sandbox: true)     │
│  • Zero direct Node.js, filesystem, or SQLite access                      │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │  window.zenithAPI (contextBridge)
┌───────────────────────────────────▼───────────────────────────────────────┐
│  Preload Script (electron/preload.cjs)                                    │
│  • Runs with contextIsolation: true                                       │
│  • Exposes strictly typed, channel-allowlisted invoke & subscribe methods │
│  • Never exposes raw ipcRenderer to window                                │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │  ipcRenderer.invoke  ▲ webContents.send
                                    │  (Request / Response)│ (Live Push Events)
┌───────────────────────────────────▼──────────────────────┴────────────────┐
│  Main Process (electron/main.cjs + electron/database.cjs)                 │
│  • Manages BrowserWindow lifecycle & native OS Notification API           │
│  • Runs the authoritative Focus Timer engine (1s interval ticks)          │
│  • Owns SQLite database (PRAGMA foreign_keys = ON) persisted to userData  │
│  • Handles scrypt auth, distraction checks, point ledger & achievements   │
└───────────────────────────────────────────────────────────────────────────┘
```

### IPC Channel Contract (`electron/ipcChannels.cjs`)

#### 1. Renderer → Main (`ipcRenderer.invoke` / `ipcMain.handle`)

| Domain | Channels | Responsibility |
| --- | --- | --- |
| **Auth** | `auth:register`, `auth:login`, `auth:logout`, `auth:current` | Salted `scrypt` registration/login and session management |
| **Dashboard** | `dashboard:get` | Aggregated daily goal progress, stats, recent sessions & events |
| **Focus Rooms** | `rooms:list`, `rooms:create`, `rooms:join`, `rooms:leave` | Collaborative focus rooms and participant membership |
| **Focus Sessions** | `session:start`, `session:pause`, `session:resume`, `session:complete`, `session:cancel`, `session:active`, `sessions:list` | Authoritative Main-process timer lifecycle & session persistence |
| **Activity Events** | `events:list` | Chronological `FocusEvent` audit log |
| **Distraction Blocker** | `blocker:list`, `blocker:add`, `blocker:toggle`, `blocker:remove`, `blocker:check` | Per-user `BlockedResource` rules and live distraction checking |
| **Gamification** | `gamification:get` | Achievements progress, unlocks, and `PointTransaction` ledger |
| **Settings & Runtime** | `settings:update`, `system:info` | Personalized preferences and Electron/Node/SQLite runtime diagnostics |

#### 2. Main → Renderer (`webContents.send` / `ipcRenderer.on`)

| Channel | Trigger |
| --- | --- |
| `timer:tick` | Emitted every second by the Main-process timer engine with remaining/elapsed time |
| `session:completed` | Emitted when a focus session completes and points are awarded |
| `achievement:unlocked` | Emitted whenever a user meets criteria for a new `Achievement` |
| `distraction:blocked` | Emitted when `blocker:check` intercepts a blocked website/app |

## Relational Database Schema (`electron/database.cjs`)

SQLite is initialized with `PRAGMA foreign_keys = ON` and enforces primary keys, foreign keys (`ON DELETE CASCADE` / `ON DELETE SET NULL`), `CHECK` constraints, and `UNIQUE` constraints across all entities:

- **`User`** — `id` (PK), `username` (UNIQUE), `email` (UNIQUE), `password_hash`, `display_name`, `points`, `streak_days`, `daily_goal_minutes`, `settings_json`, `created_at`
- **`Room`** — `id` (PK), `code` (UNIQUE), `name`, `description`, `topic`, `host_user_id` (FK → `User.id`), `is_active`, `max_participants`, `created_at`
- **`RoomParticipant`** — `id` (PK), `room_id` (FK → `Room.id`), `user_id` (FK → `User.id`), `role`, `status`, `joined_at`, `UNIQUE(room_id, user_id)`
- **`FocusSession`** — `id` (PK), `user_id` (FK → `User.id`), `room_id` (FK → `Room.id`), `title`, `planned_minutes`, `actual_minutes`, `status`, `points_earned`, `started_at`, `ended_at`
- **`FocusEvent`** — `id` (PK), `session_id` (FK → `FocusSession.id`), `user_id` (FK → `User.id`), `event_type`, `resource_label`, `metadata_json`, `created_at`
- **`BlockedResource`** — `id` (PK), `user_id` (FK → `User.id`), `domain_or_app`, `category`, `is_enabled`, `block_count`, `created_at`, `UNIQUE(user_id, domain_or_app)`
- **`Achievement`** — `id` (PK), `code` (UNIQUE), `title`, `description`, `icon`, `points_reward`, `criteria_type`, `criteria_value`
- **`UserAchievement`** — `id` (PK), `user_id` (FK → `User.id`), `achievement_id` (FK → `Achievement.id`), `unlocked_at`, `UNIQUE(user_id, achievement_id)`
- **`PointTransaction`** — `id` (PK), `user_id` (FK → `User.id`), `session_id` (FK → `FocusSession.id`), `achievement_id` (FK → `Achievement.id`), `delta`, `reason`, `balance_after`, `created_at`

## Getting Started

### Prerequisites

- Node.js 18+

### Install & Run

```bash
npm install

# Run in development mode (Vite Renderer + Electron Main)
npm run dev

# Or build the Renderer bundle and launch Electron
npm start
```

### Demo Credentials

A seeded demo account is ready on first launch:
- **Username**: `demo`
- **Password**: `zenith123`

You can also register any new account directly from the sign-in screen.

## Scripts

```bash
npm run dev            # Start Vite dev server + Electron desktop app
npm start              # Build production renderer bundle & start Electron
npm run build:renderer # Build the React/TypeScript renderer into dist/
npm run typecheck      # Run TypeScript typechecking (tsc --noEmit)
npm run test:db        # Verify SQLite schema, FK/UNIQUE constraints, and domain logic
```
