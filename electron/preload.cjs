const { contextBridge, ipcRenderer } = require('electron');

// Explicitly allowlisted push-event channels from Main -> Renderer
const ALLOWED_EVENT_CHANNELS = new Set([
  'timer:tick',
  'session:completed',
  'achievement:unlocked',
  'distraction:blocked',
  'monitor:status',
  'rooms:synced',
  'sync:status',
]);

function subscribe(channel, callback) {
  if (!ALLOWED_EVENT_CHANNELS.has(channel)) {
    throw new Error(`Unauthorized IPC event channel: ${channel}`);
  }
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('zenithAPI', {
  auth: {
    register: (payload) => ipcRenderer.invoke('auth:register', payload),
    login: (payload) => ipcRenderer.invoke('auth:login', payload),
    logout: () => ipcRenderer.invoke('auth:logout'),
    current: () => ipcRenderer.invoke('auth:current'),
  },
  dashboard: {
    get: () => ipcRenderer.invoke('dashboard:get'),
  },
  rooms: {
    list: () => ipcRenderer.invoke('rooms:list'),
    create: (payload) => ipcRenderer.invoke('rooms:create', payload),
    join: (payload) => ipcRenderer.invoke('rooms:join', payload),
    leave: (roomId) => ipcRenderer.invoke('rooms:leave', roomId),
  },
  sessions: {
    start: (payload) => ipcRenderer.invoke('session:start', payload),
    pause: () => ipcRenderer.invoke('session:pause'),
    resume: () => ipcRenderer.invoke('session:resume'),
    complete: () => ipcRenderer.invoke('session:complete'),
    cancel: () => ipcRenderer.invoke('session:cancel'),
    active: () => ipcRenderer.invoke('session:active'),
    list: () => ipcRenderer.invoke('sessions:list'),
  },
  events: {
    list: () => ipcRenderer.invoke('events:list'),
  },
  blocker: {
    list: () => ipcRenderer.invoke('blocker:list'),
    add: (payload) => ipcRenderer.invoke('blocker:add', payload),
    toggle: (payload) => ipcRenderer.invoke('blocker:toggle', payload),
    remove: (resourceId) => ipcRenderer.invoke('blocker:remove', resourceId),
    check: (target) => ipcRenderer.invoke('blocker:check', target),
  },
  monitor: {
    status: () => ipcRenderer.invoke('monitor:status'),
    toggle: (enabled) => ipcRenderer.invoke('monitor:toggle', enabled),
  },
  sync: {
    status: () => ipcRenderer.invoke('sync:status'),
    configure: (url) => ipcRenderer.invoke('sync:configure', url),
  },
  gamification: {
    get: () => ipcRenderer.invoke('gamification:get'),
  },
  settings: {
    update: (payload) => ipcRenderer.invoke('settings:update', payload),
  },
  system: {
    info: () => ipcRenderer.invoke('system:info'),
  },
  onTimerTick: (cb) => subscribe('timer:tick', cb),
  onSessionCompleted: (cb) => subscribe('session:completed', cb),
  onAchievementUnlocked: (cb) => subscribe('achievement:unlocked', cb),
  onDistractionBlocked: (cb) => subscribe('distraction:blocked', cb),
  onMonitorStatus: (cb) => subscribe('monitor:status', cb),
  onRoomsSynced: (cb) => subscribe('rooms:synced', cb),
  onSyncStatus: (cb) => subscribe('sync:status', cb),
});
