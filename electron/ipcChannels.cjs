const IPC_INVOKE = {
  AUTH_REGISTER: 'auth:register',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_CURRENT: 'auth:current',
  DASHBOARD_GET: 'dashboard:get',
  ROOMS_LIST: 'rooms:list',
  ROOMS_CREATE: 'rooms:create',
  ROOMS_JOIN: 'rooms:join',
  ROOMS_LEAVE: 'rooms:leave',
  SESSION_START: 'session:start',
  SESSION_PAUSE: 'session:pause',
  SESSION_RESUME: 'session:resume',
  SESSION_COMPLETE: 'session:complete',
  SESSION_CANCEL: 'session:cancel',
  SESSION_ACTIVE: 'session:active',
  SESSIONS_LIST: 'sessions:list',
  EVENTS_LIST: 'events:list',
  BLOCKER_LIST: 'blocker:list',
  BLOCKER_ADD: 'blocker:add',
  BLOCKER_TOGGLE: 'blocker:toggle',
  BLOCKER_REMOVE: 'blocker:remove',
  BLOCKER_CHECK: 'blocker:check',
  GAMIFICATION_GET: 'gamification:get',
  SETTINGS_UPDATE: 'settings:update',
  SYSTEM_INFO: 'system:info',
};

const IPC_EVENTS = {
  TIMER_TICK: 'timer:tick',
  SESSION_COMPLETED: 'session:completed',
  ACHIEVEMENT_UNLOCKED: 'achievement:unlocked',
  DISTRACTION_BLOCKED: 'distraction:blocked',
};

module.exports = { IPC_INVOKE, IPC_EVENTS };
