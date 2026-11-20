export type UserSettings = {
  defaultFocusMinutes: number;
  shortBreakMinutes: number;
  strictBlocking: boolean;
  desktopNotifications: boolean;
  soundEnabled: boolean;
  autoStartBreaks: boolean;
};

export type User = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  points: number;
  streakDays: number;
  dailyGoalMinutes: number;
  settings: UserSettings;
  createdAt: string;
};

export type UserStats = {
  points: number;
  streakDays: number;
  dailyGoalMinutes: number;
  completedSessions: number;
  totalFocusMinutes: number;
  todayFocusMinutes: number;
  todaySessions: number;
  totalBlockedCount: number;
  blockedResourceCount: number;
  roomsJoined: number;
};

export type RoomParticipant = {
  id: string;
  userId: string;
  role: 'HOST' | 'MEMBER';
  status: 'FOCUSING' | 'BREAK' | 'IDLE';
  joinedAt: string;
  displayName: string;
  username: string;
};

export type Room = {
  id: string;
  code: string;
  name: string;
  description: string;
  topic: string;
  hostUserId: string;
  hostName: string;
  isActive: boolean;
  maxParticipants: number;
  participantCount: number;
  isJoined: boolean;
  createdAt: string;
  participants: RoomParticipant[];
};

export type FocusSession = {
  id: string;
  userId: string;
  roomId: string | null;
  roomName: string | null;
  title: string;
  plannedMinutes: number;
  actualMinutes: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  pointsEarned: number;
  startedAt: string;
  endedAt: string | null;
};

export type FocusEvent = {
  id: string;
  sessionId: string | null;
  userId: string;
  eventType:
    | 'SESSION_STARTED'
    | 'SESSION_PAUSED'
    | 'SESSION_RESUMED'
    | 'SESSION_COMPLETED'
    | 'SESSION_CANCELLED'
    | 'DISTRACTION_BLOCKED'
    | 'ROOM_JOINED'
    | 'GOAL_UPDATED';
  resourceLabel: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type BlockedResource = {
  id: string;
  userId: string;
  domainOrApp: string;
  category: string;
  isEnabled: boolean;
  blockCount: number;
  createdAt: string;
};

export type Achievement = {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: string;
  pointsReward: number;
  criteriaType: string;
  criteriaValue: number;
  currentValue: number;
  unlocked: boolean;
  unlockedAt: string | null;
};

export type PointTransaction = {
  id: string;
  userId: string;
  sessionId: string | null;
  achievementId: string | null;
  delta: number;
  reason: string;
  balanceAfter: number;
  createdAt: string;
};

export type ActiveTimer = {
  sessionId: string;
  userId: string;
  title: string;
  roomId: string | null;
  roomName: string | null;
  plannedSeconds: number;
  remainingSeconds: number;
  elapsedSeconds: number;
  status: 'ACTIVE' | 'PAUSED';
};

export type DashboardData = {
  user: User;
  stats: UserStats;
  recentSessions: FocusSession[];
  recentEvents: FocusEvent[];
  activeTimer: ActiveTimer | null;
};

export type GamificationData = {
  stats: UserStats;
  achievements: Achievement[];
  transactions: PointTransaction[];
};

export type SystemInfo = {
  platform: string;
  electronVersion: string;
  nodeVersion: string;
  chromeVersion: string;
  dbPath: string;
};

export type MonitorStatus = {
  running: boolean;
  activeApp: string;
  activeUrl: string;
  lastCheckedAt: string | null;
  supported: boolean;
};

export type SyncStatus = {
  url: string;
  connected: boolean;
};

export interface ZenithAPI {
  auth: {
    register: (payload: { username: string; email: string; password: string; displayName: string }) => Promise<User>;
    login: (payload: { identifier: string; password: string }) => Promise<User>;
    logout: () => Promise<{ ok: boolean }>;
    current: () => Promise<User | null>;
  };
  dashboard: {
    get: () => Promise<DashboardData>;
  };
  rooms: {
    list: () => Promise<Room[]>;
    create: (payload: { name: string; description: string; topic: string; maxParticipants?: number }) => Promise<{ room: Room; unlocked: Achievement[] }>;
    join: (payload: { roomId?: string; code?: string }) => Promise<{ room: Room; unlocked: Achievement[] }>;
    leave: (roomId: string) => Promise<{ ok: boolean }>;
  };
  sessions: {
    start: (payload: { title: string; plannedMinutes: number; roomId?: string | null; roomName?: string | null }) => Promise<{ session: FocusSession; activeTimer: ActiveTimer }>;
    pause: () => Promise<ActiveTimer | null>;
    resume: () => Promise<ActiveTimer | null>;
    complete: () => Promise<{ session: FocusSession; pointsEarned: number; unlocked: Achievement[] } | null>;
    cancel: () => Promise<{ session: FocusSession; pointsEarned: number; unlocked: Achievement[] } | null>;
    active: () => Promise<ActiveTimer | null>;
    list: () => Promise<FocusSession[]>;
  };
  events: {
    list: () => Promise<FocusEvent[]>;
  };
  blocker: {
    list: () => Promise<BlockedResource[]>;
    add: (payload: { domainOrApp: string; category: string }) => Promise<BlockedResource>;
    toggle: (payload: { id: string; isEnabled: boolean }) => Promise<BlockedResource>;
    remove: (resourceId: string) => Promise<{ ok: boolean }>;
    check: (target: string) => Promise<{ blocked: boolean; resource: BlockedResource | null; unlocked: Achievement[] }>;
  };
  monitor: {
    status: () => Promise<MonitorStatus>;
    toggle: (enabled: boolean) => Promise<MonitorStatus>;
  };
  sync: {
    status: () => Promise<SyncStatus>;
    configure: (url: string) => Promise<SyncStatus>;
  };
  gamification: {
    get: () => Promise<GamificationData>;
  };
  settings: {
    update: (payload: { displayName?: string; dailyGoalMinutes?: number; settings?: Partial<UserSettings> }) => Promise<User>;
  };
  system: {
    info: () => Promise<SystemInfo>;
  };
  onTimerTick: (cb: (timer: ActiveTimer | null) => void) => () => void;
  onSessionCompleted: (cb: (payload: { session: FocusSession; pointsEarned: number; unlocked: Achievement[] }) => void) => () => void;
  onAchievementUnlocked: (cb: (achievement: Achievement) => void) => () => void;
  onDistractionBlocked: (cb: (resource: BlockedResource) => void) => () => void;
  onMonitorStatus: (cb: (status: MonitorStatus) => void) => () => void;
  onRoomsSynced: (cb: (payload: { updatedAt: string }) => void) => () => void;
  onSyncStatus: (cb: (status: SyncStatus) => void) => () => void;
}

declare global {
  interface Window {
    zenithAPI: ZenithAPI;
  }
}
