const path = require('node:path');
const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const { ZenithDatabase } = require('./database.cjs');
const { IPC_INVOKE, IPC_EVENTS } = require('./ipcChannels.cjs');
const { DistractionMonitor } = require('./monitor.cjs');
const { RoomSyncClient } = require('./roomSync.cjs');

let mainWindow = null;
let db = null;
let currentUserId = null;

// Authoritative Focus Timer state managed in the Main Process
let activeTimer = null;
let timerInterval = null;
let manualMonitorEnabled = false;

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function notifyOS(title, body) {
  if (!currentUserId || !db) return;
  const user = db.getUserById(currentUserId);
  if (user?.settings?.desktopNotifications && Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

const monitor = new DistractionMonitor({
  onStatus: (status) => sendToRenderer(IPC_EVENTS.MONITOR_STATUS, status),
  onBlocked: (result, ctx) => {
    sendToRenderer(IPC_EVENTS.DISTRACTION_BLOCKED, result.resource);
    notifyOS(
      'Distraction Blocked by Zenith',
      `Detected ${result.resource.domainOrApp} (${ctx.appName}) — stay focused! (+5 pts)`,
    );
    for (const a of result.unlocked || []) {
      sendToRenderer(IPC_EVENTS.ACHIEVEMENT_UNLOCKED, a);
    }
    const user = currentUserId && db ? db.getUserById(currentUserId) : null;
    if (user?.settings?.strictBlocking && mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  },
});

const roomSync = new RoomSyncClient({
  url: process.env.ZENITH_SYNC_URL || 'http://127.0.0.1:4123',
  onRoomsUpdated: () => sendToRenderer(IPC_EVENTS.ROOMS_SYNCED, { updatedAt: new Date().toISOString() }),
  onConnectionChange: (status) => sendToRenderer(IPC_EVENTS.SYNC_STATUS, status),
});

function syncMonitorLifecycle() {
  const shouldRun = Boolean(currentUserId && (manualMonitorEnabled || activeTimer?.status === 'ACTIVE'));
  if (shouldRun) {
    monitor.start((candidate) => {
      if (!currentUserId || !db) return { blocked: false };
      return db.checkDistraction(currentUserId, candidate, activeTimer?.sessionId || null);
    });
  } else {
    monitor.stop();
  }
}

function stopTimerInterval() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimerInterval() {
  stopTimerInterval();
  timerInterval = setInterval(() => {
    if (!activeTimer || activeTimer.status !== 'ACTIVE') return;
    activeTimer.remainingSeconds = Math.max(0, activeTimer.remainingSeconds - 1);
    activeTimer.elapsedSeconds += 1;
    sendToRenderer(IPC_EVENTS.TIMER_TICK, { ...activeTimer });

    if (activeTimer.remainingSeconds <= 0) {
      finishActiveSession(false);
    }
  }, 1000);
}

function finishActiveSession(cancelled) {
  if (!activeTimer || !db) return null;
  stopTimerInterval();
  const snapshot = activeTimer;
  activeTimer = null;
  syncMonitorLifecycle();

  if (roomSync.connected) {
    roomSync.updateStatus({ userId: snapshot.userId, status: 'IDLE' }).catch(() => {});
  }

  const actualMinutes = cancelled
    ? Math.floor(snapshot.elapsedSeconds / 60)
    : Math.max(1, Math.round(snapshot.elapsedSeconds / 60) || Math.round(snapshot.plannedSeconds / 60));

  const result = db.completeSession(snapshot.userId, snapshot.sessionId, actualMinutes, cancelled);
  sendToRenderer(IPC_EVENTS.TIMER_TICK, null);
  if (!cancelled) {
    sendToRenderer(IPC_EVENTS.SESSION_COMPLETED, result);
    notifyOS('Zenith Focus Complete', `Completed "${snapshot.title}" (+${result.pointsEarned} pts)`);
    for (const a of result.unlocked || []) {
      sendToRenderer(IPC_EVENTS.ACHIEVEMENT_UNLOCKED, a);
      notifyOS('Achievement Unlocked!', `${a.title} (+${a.pointsReward} pts)`);
    }
  }
  return result;
}

function requireAuth() {
  if (!currentUserId) throw new Error('Not authenticated. Please sign in.');
  return currentUserId;
}

function registerIpcHandlers() {
  ipcMain.handle(IPC_INVOKE.AUTH_REGISTER, (_e, payload) => {
    const user = db.register(payload || {});
    currentUserId = user.id;
    syncMonitorLifecycle();
    return user;
  });

  ipcMain.handle(IPC_INVOKE.AUTH_LOGIN, (_e, payload) => {
    const user = db.login(payload || {});
    currentUserId = user.id;
    syncMonitorLifecycle();
    return user;
  });

  ipcMain.handle(IPC_INVOKE.AUTH_LOGOUT, () => {
    if (activeTimer) finishActiveSession(true);
    manualMonitorEnabled = false;
    currentUserId = null;
    syncMonitorLifecycle();
    return { ok: true };
  });

  ipcMain.handle(IPC_INVOKE.AUTH_CURRENT, () => {
    if (!currentUserId) return null;
    return db.getUserById(currentUserId);
  });

  ipcMain.handle(IPC_INVOKE.DASHBOARD_GET, () => {
    const uid = requireAuth();
    return { ...db.getDashboard(uid), activeTimer };
  });

  ipcMain.handle(IPC_INVOKE.ROOMS_LIST, async () => {
    const uid = requireAuth();
    if (roomSync.connected) {
      try {
        const remote = await roomSync.listRooms(uid);
        if (Array.isArray(remote)) return remote;
      } catch {}
    }
    return db.listRooms(uid);
  });

  ipcMain.handle(IPC_INVOKE.ROOMS_CREATE, async (_e, payload) => {
    const uid = requireAuth();
    const user = db.getUserById(uid);
    if (roomSync.connected) {
      try {
        const remoteRoom = await roomSync.createRoom({
          userId: uid,
          displayName: user.displayName,
          username: user.username,
          ...(payload || {}),
        });
        db.logEvent(uid, 'ROOM_JOINED', null, remoteRoom.name, { roomId: remoteRoom.id, code: remoteRoom.code, synced: true });
        db.persist();
        return { room: remoteRoom, unlocked: [] };
      } catch {}
    }
    const result = db.createRoom(uid, payload || {});
    for (const a of result.unlocked || []) {
      sendToRenderer(IPC_EVENTS.ACHIEVEMENT_UNLOCKED, a);
    }
    return result;
  });

  ipcMain.handle(IPC_INVOKE.ROOMS_JOIN, async (_e, payload) => {
    const uid = requireAuth();
    const user = db.getUserById(uid);
    if (roomSync.connected) {
      try {
        const remoteRoom = await roomSync.joinRoom({
          userId: uid,
          displayName: user.displayName,
          username: user.username,
          ...(payload || {}),
        });
        db.logEvent(uid, 'ROOM_JOINED', null, remoteRoom.name, { roomId: remoteRoom.id, code: remoteRoom.code, synced: true });
        db.persist();
        return { room: remoteRoom, unlocked: [] };
      } catch (err) {
        if (payload?.code) throw err;
      }
    }
    const result = db.joinRoom(uid, payload || {});
    for (const a of result.unlocked || []) {
      sendToRenderer(IPC_EVENTS.ACHIEVEMENT_UNLOCKED, a);
    }
    return result;
  });

  ipcMain.handle(IPC_INVOKE.ROOMS_LEAVE, async (_e, roomId) => {
    const uid = requireAuth();
    if (roomSync.connected) {
      try {
        await roomSync.leaveRoom({ userId: uid, roomId });
        return { ok: true };
      } catch {}
    }
    return db.leaveRoom(uid, roomId);
  });

  ipcMain.handle(IPC_INVOKE.SESSION_START, (_e, payload) => {
    const uid = requireAuth();
    if (activeTimer) finishActiveSession(true);

    // If roomId comes from remote sync server and isn't in local SQLite, pass null for FK safety
    const localRoom = payload?.roomId ? db.get('SELECT id FROM Room WHERE id = ?', [payload.roomId]) : null;
    const session = db.startSession(uid, {
      ...(payload || {}),
      roomId: localRoom ? payload.roomId : null,
    });
    activeTimer = {
      sessionId: session.id,
      userId: uid,
      title: session.title,
      roomId: payload?.roomId || session.roomId,
      roomName: payload?.roomName || session.roomName,
      plannedSeconds: session.plannedMinutes * 60,
      remainingSeconds: session.plannedMinutes * 60,
      elapsedSeconds: 0,
      status: 'ACTIVE',
    };
    startTimerInterval();
    syncMonitorLifecycle();
    if (roomSync.connected) {
      roomSync.updateStatus({ userId: uid, status: 'FOCUSING' }).catch(() => {});
    }
    sendToRenderer(IPC_EVENTS.TIMER_TICK, { ...activeTimer });
    return { session, activeTimer: { ...activeTimer } };
  });

  ipcMain.handle(IPC_INVOKE.SESSION_PAUSE, () => {
    const uid = requireAuth();
    if (!activeTimer) return null;
    activeTimer.status = 'PAUSED';
    stopTimerInterval();
    syncMonitorLifecycle();
    db.updateSessionStatus(uid, activeTimer.sessionId, 'PAUSED');
    if (roomSync.connected) {
      roomSync.updateStatus({ userId: uid, status: 'BREAK' }).catch(() => {});
    }
    sendToRenderer(IPC_EVENTS.TIMER_TICK, { ...activeTimer });
    return { ...activeTimer };
  });

  ipcMain.handle(IPC_INVOKE.SESSION_RESUME, () => {
    const uid = requireAuth();
    if (!activeTimer) return null;
    activeTimer.status = 'ACTIVE';
    db.updateSessionStatus(uid, activeTimer.sessionId, 'ACTIVE');
    startTimerInterval();
    syncMonitorLifecycle();
    if (roomSync.connected) {
      roomSync.updateStatus({ userId: uid, status: 'FOCUSING' }).catch(() => {});
    }
    sendToRenderer(IPC_EVENTS.TIMER_TICK, { ...activeTimer });
    return { ...activeTimer };
  });

  ipcMain.handle(IPC_INVOKE.SESSION_COMPLETE, () => {
    requireAuth();
    return finishActiveSession(false);
  });

  ipcMain.handle(IPC_INVOKE.SESSION_CANCEL, () => {
    requireAuth();
    return finishActiveSession(true);
  });

  ipcMain.handle(IPC_INVOKE.SESSION_ACTIVE, () => {
    return activeTimer ? { ...activeTimer } : null;
  });

  ipcMain.handle(IPC_INVOKE.SESSIONS_LIST, () => {
    const uid = requireAuth();
    return db.listSessions(uid, 40);
  });

  ipcMain.handle(IPC_INVOKE.EVENTS_LIST, () => {
    const uid = requireAuth();
    return db.listEvents(uid, 60);
  });

  ipcMain.handle(IPC_INVOKE.BLOCKER_LIST, () => {
    const uid = requireAuth();
    return db.listBlockedResources(uid);
  });

  ipcMain.handle(IPC_INVOKE.BLOCKER_ADD, (_e, payload) => {
    const uid = requireAuth();
    return db.addBlockedResource(uid, payload || {});
  });

  ipcMain.handle(IPC_INVOKE.BLOCKER_TOGGLE, (_e, payload) => {
    const uid = requireAuth();
    return db.toggleBlockedResource(uid, payload.id, payload.isEnabled);
  });

  ipcMain.handle(IPC_INVOKE.BLOCKER_REMOVE, (_e, resourceId) => {
    const uid = requireAuth();
    return db.removeBlockedResource(uid, resourceId);
  });

  ipcMain.handle(IPC_INVOKE.BLOCKER_CHECK, (_e, target) => {
    const uid = requireAuth();
    const result = db.checkDistraction(uid, target, activeTimer?.sessionId || null);
    if (result.blocked) {
      sendToRenderer(IPC_EVENTS.DISTRACTION_BLOCKED, result.resource);
      notifyOS('Distraction Blocked', `Zenith blocked ${result.resource.domainOrApp} (+5 pts)`);
      for (const a of result.unlocked || []) {
        sendToRenderer(IPC_EVENTS.ACHIEVEMENT_UNLOCKED, a);
      }
    }
    return result;
  });

  ipcMain.handle(IPC_INVOKE.MONITOR_STATUS, () => monitor.getStatus());

  ipcMain.handle(IPC_INVOKE.MONITOR_TOGGLE, (_e, enabled) => {
    requireAuth();
    manualMonitorEnabled = Boolean(enabled);
    syncMonitorLifecycle();
    return monitor.getStatus();
  });

  ipcMain.handle(IPC_INVOKE.SYNC_STATUS, () => roomSync.getStatus());

  ipcMain.handle(IPC_INVOKE.SYNC_CONFIGURE, (_e, url) => {
    roomSync.setUrl(url);
    return roomSync.getStatus();
  });

  ipcMain.handle(IPC_INVOKE.GAMIFICATION_GET, () => {
    const uid = requireAuth();
    return db.getGamification(uid);
  });

  ipcMain.handle(IPC_INVOKE.SETTINGS_UPDATE, (_e, payload) => {
    const uid = requireAuth();
    return db.updateSettings(uid, payload || {});
  });

  ipcMain.handle(IPC_INVOKE.SYSTEM_INFO, () => ({
    platform: process.platform,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    chromeVersion: process.versions.chrome,
    dbPath: db.dbPath,
  }));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 660,
    backgroundColor: '#F8FAFC',
    title: 'Zenith — Focus & Productivity',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devUrl = process.env.ZENITH_DEV_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'zenith.sqlite');
  db = await new ZenithDatabase(dbPath).init();
  registerIpcHandlers();
  createWindow();
  roomSync.connect();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopTimerInterval();
  monitor.stop();
  roomSync.destroy();
  if (process.platform !== 'darwin') app.quit();
});
