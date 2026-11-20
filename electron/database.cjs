const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

const DEFAULT_SETTINGS = {
  defaultFocusMinutes: 25,
  shortBreakMinutes: 5,
  strictBlocking: true,
  desktopNotifications: true,
  soundEnabled: true,
  autoStartBreaks: false,
};

const SEED_ACHIEVEMENTS = [
  {
    code: 'FIRST_FOCUS',
    title: 'First Focus',
    description: 'Complete your first focus session on Zenith.',
    icon: 'sparkles',
    points_reward: 50,
    criteria_type: 'SESSIONS_COMPLETED',
    criteria_value: 1,
  },
  {
    code: 'DEEP_WORK_60',
    title: 'Deep Work Hour',
    description: 'Accumulate 60 total minutes of focused work.',
    icon: 'flame',
    points_reward: 100,
    criteria_type: 'TOTAL_MINUTES',
    criteria_value: 60,
  },
  {
    code: 'DISTRACTION_SLAYER',
    title: 'Distraction Slayer',
    description: 'Block 3 or more distracting websites or apps.',
    icon: 'shield',
    points_reward: 75,
    criteria_type: 'DISTRACTIONS_BLOCKED',
    criteria_value: 3,
  },
  {
    code: 'COLLABORATOR',
    title: 'Team Accountability',
    description: 'Join or host a collaborative focus room.',
    icon: 'users',
    points_reward: 60,
    criteria_type: 'ROOMS_JOINED',
    criteria_value: 1,
  },
  {
    code: 'POINT_COLLECTOR',
    title: 'Century Club',
    description: 'Earn 250 or more Zenith productivity points.',
    icon: 'trophy',
    points_reward: 120,
    criteria_type: 'TOTAL_POINTS',
    criteria_value: 250,
  },
  {
    code: 'CONSISTENCY_3',
    title: 'Momentum Builder',
    description: 'Complete 3 focus sessions to build lasting consistency.',
    icon: 'zap',
    points_reward: 150,
    criteria_type: 'SESSIONS_COMPLETED',
    criteria_value: 3,
  },
];

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function normalizeResource(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
}

function generateRoomCode() {
  return `ZEN-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

class ZenithDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  async init() {
    const SQL = await initSqlJs();
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
    } else {
      this.db = new SQL.Database();
    }

    this.db.run('PRAGMA foreign_keys = ON;');
    this.createSchema();
    this.seedDefaults();
    this.persist();
    return this;
  }

  persist() {
    if (!this.db) return;
    const data = this.db.export();
    const tmp = `${this.dbPath}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(data));
    fs.renameSync(tmp, this.dbPath);
  }

  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  get(sql, params = []) {
    return this.all(sql, params)[0] || null;
  }

  run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      stmt.step();
    } finally {
      stmt.free();
    }
  }

  createSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS User (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        streak_days INTEGER NOT NULL DEFAULT 1,
        daily_goal_minutes INTEGER NOT NULL DEFAULT 120,
        settings_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS Room (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        topic TEXT NOT NULL DEFAULT 'Deep Work',
        host_user_id TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        max_participants INTEGER NOT NULL DEFAULT 12,
        created_at TEXT NOT NULL,
        FOREIGN KEY (host_user_id) REFERENCES User(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS RoomParticipant (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('HOST', 'MEMBER')),
        status TEXT NOT NULL DEFAULT 'FOCUSING' CHECK (status IN ('FOCUSING', 'BREAK', 'IDLE')),
        joined_at TEXT NOT NULL,
        UNIQUE (room_id, user_id),
        FOREIGN KEY (room_id) REFERENCES Room(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS FocusSession (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        room_id TEXT,
        title TEXT NOT NULL,
        planned_minutes INTEGER NOT NULL CHECK (planned_minutes > 0),
        actual_minutes INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
        points_earned INTEGER NOT NULL DEFAULT 0,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES Room(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS FocusEvent (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        user_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (
          event_type IN (
            'SESSION_STARTED',
            'SESSION_PAUSED',
            'SESSION_RESUMED',
            'SESSION_COMPLETED',
            'SESSION_CANCELLED',
            'DISTRACTION_BLOCKED',
            'ROOM_JOINED',
            'GOAL_UPDATED'
          )
        ),
        resource_label TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES FocusSession(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS BlockedResource (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        domain_or_app TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Social',
        is_enabled INTEGER NOT NULL DEFAULT 1,
        block_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE (user_id, domain_or_app),
        FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS Achievement (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        icon TEXT NOT NULL,
        points_reward INTEGER NOT NULL DEFAULT 50,
        criteria_type TEXT NOT NULL,
        criteria_value INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS UserAchievement (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        achievement_id TEXT NOT NULL,
        unlocked_at TEXT NOT NULL,
        UNIQUE (user_id, achievement_id),
        FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
        FOREIGN KEY (achievement_id) REFERENCES Achievement(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS PointTransaction (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_id TEXT,
        achievement_id TEXT,
        delta INTEGER NOT NULL,
        reason TEXT NOT NULL,
        balance_after INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES FocusSession(id) ON DELETE SET NULL,
        FOREIGN KEY (achievement_id) REFERENCES Achievement(id) ON DELETE SET NULL
      );
    `);
  }

  seedDefaults() {
    for (const a of SEED_ACHIEVEMENTS) {
      const existing = this.get('SELECT id FROM Achievement WHERE code = ?', [a.code]);
      if (!existing) {
        this.run(
          `INSERT INTO Achievement (id, code, title, description, icon, points_reward, criteria_type, criteria_value)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), a.code, a.title, a.description, a.icon, a.points_reward, a.criteria_type, a.criteria_value],
        );
      }
    }

    const demoUser = this.get('SELECT id FROM User WHERE username = ?', ['demo']);
    if (!demoUser) {
      const now = new Date().toISOString();
      const earlier = new Date(Date.now() - 45 * 60 * 1000).toISOString();
      const userId = crypto.randomUUID();

      this.run(
        `INSERT INTO User (id, username, email, password_hash, display_name, points, streak_days, daily_goal_minutes, settings_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          'demo',
          'demo@zenith.app',
          hashPassword('zenith123'),
          'Alex Rivera',
          0,
          3,
          120,
          JSON.stringify(DEFAULT_SETTINGS),
          now,
        ],
      );

      // Seed collaborative rooms
      const room1Id = crypto.randomUUID();
      const room2Id = crypto.randomUUID();
      this.run(
        `INSERT INTO Room (id, code, name, description, topic, host_user_id, is_active, max_participants, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 12, ?)`,
        [room1Id, 'ZEN-STUDY', 'CS Algorithms Sprint', 'Silent Pomodoro blocks for exam prep and problem solving.', 'Study', userId, earlier],
      );
      this.run(
        `INSERT INTO Room (id, code, name, description, topic, host_user_id, is_active, max_participants, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 10, ?)`,
        [room2Id, 'ZEN-BUILD', 'Deep Work Builders', 'Heads-down coding & writing accountability lounge.', 'Engineering', userId, earlier],
      );
      this.run(
        `INSERT INTO RoomParticipant (id, room_id, user_id, role, status, joined_at)
         VALUES (?, ?, ?, 'HOST', 'FOCUSING', ?)`,
        [crypto.randomUUID(), room1Id, userId, earlier],
      );
      this.run(
        `INSERT INTO RoomParticipant (id, room_id, user_id, role, status, joined_at)
         VALUES (?, ?, ?, 'HOST', 'IDLE', ?)`,
        [crypto.randomUUID(), room2Id, userId, earlier],
      );

      // Seed blocked resources
      const defaults = [
        ['youtube.com', 'Video', 2],
        ['instagram.com', 'Social', 1],
        ['reddit.com', 'Social', 0],
        ['x.com', 'Social', 0],
      ];
      for (const [domain, category, count] of defaults) {
        this.run(
          `INSERT INTO BlockedResource (id, user_id, domain_or_app, category, is_enabled, block_count, created_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
          [crypto.randomUUID(), userId, domain, category, count, earlier],
        );
      }

      // Seed one completed focus session + events + points + achievements
      const sessionId = crypto.randomUUID();
      this.run(
        `INSERT INTO FocusSession (id, user_id, room_id, title, planned_minutes, actual_minutes, status, points_earned, started_at, ended_at)
         VALUES (?, ?, ?, ?, 25, 25, 'COMPLETED', 50, ?, ?)`,
        [sessionId, userId, room1Id, 'System Design Notes', earlier, now],
      );
      this.logEvent(userId, 'SESSION_STARTED', sessionId, 'System Design Notes', { plannedMinutes: 25 }, earlier);
      this.logEvent(userId, 'DISTRACTION_BLOCKED', sessionId, 'youtube.com', { category: 'Video' }, earlier);
      this.logEvent(userId, 'SESSION_COMPLETED', sessionId, 'System Design Notes', { actualMinutes: 25, pointsEarned: 50 }, now);
      this.recordPoints(userId, 50, 'Completed 25m focus session: System Design Notes', sessionId, null);
      this.evaluateAchievements(userId);
    }
  }

  sanitizeUser(row) {
    if (!row) return null;
    let settings = { ...DEFAULT_SETTINGS };
    try {
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(row.settings_json || '{}') };
    } catch {}
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      displayName: row.display_name,
      points: Number(row.points || 0),
      streakDays: Number(row.streak_days || 1),
      dailyGoalMinutes: Number(row.daily_goal_minutes || 120),
      settings,
      createdAt: row.created_at,
    };
  }

  getUserById(userId) {
    return this.sanitizeUser(this.get('SELECT * FROM User WHERE id = ?', [userId]));
  }

  register({ username, email, password, displayName }) {
    const cleanUser = String(username || '').trim().toLowerCase();
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanDisplay = String(displayName || username || '').trim();
    if (!cleanUser || cleanUser.length < 3) throw new Error('Username must be at least 3 characters.');
    if (!cleanEmail || !cleanEmail.includes('@')) throw new Error('Please enter a valid email address.');
    if (!password || String(password).length < 6) throw new Error('Password must be at least 6 characters.');

    const dup = this.get('SELECT id FROM User WHERE username = ? OR email = ?', [cleanUser, cleanEmail]);
    if (dup) throw new Error('Username or email is already registered.');

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.run(
      `INSERT INTO User (id, username, email, password_hash, display_name, points, streak_days, daily_goal_minutes, settings_json, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 1, 120, ?, ?)`,
      [id, cleanUser, cleanEmail, hashPassword(password), cleanDisplay, JSON.stringify(DEFAULT_SETTINGS), now],
    );

    // Give new users starter blocked resources
    for (const [domain, category] of [
      ['youtube.com', 'Video'],
      ['instagram.com', 'Social'],
      ['x.com', 'Social'],
    ]) {
      this.run(
        `INSERT INTO BlockedResource (id, user_id, domain_or_app, category, is_enabled, block_count, created_at)
         VALUES (?, ?, ?, ?, 1, 0, ?)`,
        [crypto.randomUUID(), id, domain, category, now],
      );
    }

    this.persist();
    return this.getUserById(id);
  }

  login({ identifier, password }) {
    const clean = String(identifier || '').trim().toLowerCase();
    if (!clean || !password) throw new Error('Username/email and password are required.');
    const row = this.get('SELECT * FROM User WHERE username = ? OR email = ?', [clean, clean]);
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new Error('Invalid credentials. Please try again.');
    }
    return this.sanitizeUser(row);
  }

  updateSettings(userId, { displayName, dailyGoalMinutes, settings }) {
    const existing = this.get('SELECT * FROM User WHERE id = ?', [userId]);
    if (!existing) throw new Error('User not found.');

    let currentSettings = { ...DEFAULT_SETTINGS };
    try {
      currentSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(existing.settings_json || '{}') };
    } catch {}

    const merged = { ...currentSettings, ...(settings || {}) };
    const nextName = displayName ? String(displayName).trim() : existing.display_name;
    const nextGoal = Number.isFinite(Number(dailyGoalMinutes))
      ? Math.max(15, Math.min(720, Math.round(Number(dailyGoalMinutes))))
      : existing.daily_goal_minutes;

    this.run(
      'UPDATE User SET display_name = ?, daily_goal_minutes = ?, settings_json = ? WHERE id = ?',
      [nextName, nextGoal, JSON.stringify(merged), userId],
    );
    this.logEvent(userId, 'GOAL_UPDATED', null, `${nextGoal}m daily goal`, { dailyGoalMinutes: nextGoal });
    this.persist();
    return this.getUserById(userId);
  }

  logEvent(userId, eventType, sessionId = null, resourceLabel = null, metadata = {}, createdAt = new Date().toISOString()) {
    const id = crypto.randomUUID();
    this.run(
      `INSERT INTO FocusEvent (id, session_id, user_id, event_type, resource_label, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, sessionId, userId, eventType, resourceLabel, JSON.stringify(metadata || {}), createdAt],
    );
    return {
      id,
      sessionId,
      userId,
      eventType,
      resourceLabel,
      metadata,
      createdAt,
    };
  }

  recordPoints(userId, delta, reason, sessionId = null, achievementId = null) {
    const row = this.get('SELECT points FROM User WHERE id = ?', [userId]);
    if (!row) return null;
    const nextBalance = Math.max(0, Number(row.points || 0) + Number(delta));
    this.run('UPDATE User SET points = ? WHERE id = ?', [nextBalance, userId]);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.run(
      `INSERT INTO PointTransaction (id, user_id, session_id, achievement_id, delta, reason, balance_after, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, sessionId, achievementId, delta, reason, nextBalance, now],
    );
    return { id, userId, sessionId, achievementId, delta, reason, balanceAfter: nextBalance, createdAt: now };
  }

  evaluateAchievements(userId) {
    const stats = this.getUserStats(userId);
    const locked = this.all(
      `SELECT a.* FROM Achievement a
       WHERE a.id NOT IN (SELECT achievement_id FROM UserAchievement WHERE user_id = ?)`,
      [userId],
    );

    const newlyUnlocked = [];
    const now = new Date().toISOString();
    for (const a of locked) {
      let current = 0;
      if (a.criteria_type === 'SESSIONS_COMPLETED') current = stats.completedSessions;
      else if (a.criteria_type === 'TOTAL_MINUTES') current = stats.totalFocusMinutes;
      else if (a.criteria_type === 'DISTRACTIONS_BLOCKED') current = stats.totalBlockedCount;
      else if (a.criteria_type === 'ROOMS_JOINED') current = stats.roomsJoined;
      else if (a.criteria_type === 'TOTAL_POINTS') current = stats.points;

      if (current >= Number(a.criteria_value)) {
        this.run(
          `INSERT OR IGNORE INTO UserAchievement (id, user_id, achievement_id, unlocked_at)
           VALUES (?, ?, ?, ?)`,
          [crypto.randomUUID(), userId, a.id, now],
        );
        this.recordPoints(userId, a.points_reward, `Unlocked achievement: ${a.title}`, null, a.id);
        newlyUnlocked.push({
          id: a.id,
          code: a.code,
          title: a.title,
          description: a.description,
          icon: a.icon,
          pointsReward: a.points_reward,
          unlockedAt: now,
        });
      }
    }
    return newlyUnlocked;
  }

  getUserStats(userId) {
    const user = this.get('SELECT points, streak_days, daily_goal_minutes FROM User WHERE id = ?', [userId]);
    const sessionAgg = this.get(
      `SELECT COUNT(*) AS completed_count, COALESCE(SUM(actual_minutes), 0) AS total_minutes
       FROM FocusSession WHERE user_id = ? AND status = 'COMPLETED'`,
      [userId],
    );
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const todayAgg = this.get(
      `SELECT COALESCE(SUM(actual_minutes), 0) AS today_minutes, COUNT(*) AS today_sessions
       FROM FocusSession WHERE user_id = ? AND status = 'COMPLETED' AND started_at LIKE ?`,
      [userId, `${todayPrefix}%`],
    );
    const blockAgg = this.get(
      `SELECT COALESCE(SUM(block_count), 0) AS blocked_total, COUNT(*) AS resource_count
       FROM BlockedResource WHERE user_id = ?`,
      [userId],
    );
    const roomAgg = this.get(
      'SELECT COUNT(*) AS rooms_joined FROM RoomParticipant WHERE user_id = ?',
      [userId],
    );

    return {
      points: Number(user?.points || 0),
      streakDays: Number(user?.streak_days || 1),
      dailyGoalMinutes: Number(user?.daily_goal_minutes || 120),
      completedSessions: Number(sessionAgg?.completed_count || 0),
      totalFocusMinutes: Number(sessionAgg?.total_minutes || 0),
      todayFocusMinutes: Number(todayAgg?.today_minutes || 0),
      todaySessions: Number(todayAgg?.today_sessions || 0),
      totalBlockedCount: Number(blockAgg?.blocked_total || 0),
      blockedResourceCount: Number(blockAgg?.resource_count || 0),
      roomsJoined: Number(roomAgg?.rooms_joined || 0),
    };
  }

  // --- Rooms ---
  listRooms(userId) {
    const rooms = this.all(
      `SELECT r.*, u.display_name AS host_name,
        (SELECT COUNT(*) FROM RoomParticipant rp WHERE rp.room_id = r.id) AS participant_count,
        (SELECT COUNT(*) FROM RoomParticipant rp WHERE rp.room_id = r.id AND rp.user_id = ?) AS is_joined
       FROM Room r
       JOIN User u ON u.id = r.host_user_id
       WHERE r.is_active = 1
       ORDER BY r.created_at DESC`,
      [userId],
    );

    return rooms.map((r) => {
      const participants = this.all(
        `SELECT rp.id, rp.user_id AS userId, rp.role, rp.status, rp.joined_at AS joinedAt, u.display_name AS displayName, u.username
         FROM RoomParticipant rp
         JOIN User u ON u.id = rp.user_id
         WHERE rp.room_id = ?
         ORDER BY rp.joined_at ASC`,
        [r.id],
      );
      return {
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        topic: r.topic,
        hostUserId: r.host_user_id,
        hostName: r.host_name,
        isActive: Boolean(r.is_active),
        maxParticipants: Number(r.max_participants),
        participantCount: Number(r.participant_count),
        isJoined: Number(r.is_joined) > 0,
        createdAt: r.created_at,
        participants,
      };
    });
  }

  createRoom(userId, { name, description, topic, maxParticipants }) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Room name is required.');
    const id = crypto.randomUUID();
    const code = generateRoomCode();
    const now = new Date().toISOString();
    const cap = Math.max(2, Math.min(50, Number(maxParticipants) || 12));

    this.run(
      `INSERT INTO Room (id, code, name, description, topic, host_user_id, is_active, max_participants, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, code, cleanName, String(description || '').trim(), String(topic || 'Deep Work').trim(), userId, cap, now],
    );
    this.run(
      `INSERT INTO RoomParticipant (id, room_id, user_id, role, status, joined_at)
       VALUES (?, ?, ?, 'HOST', 'FOCUSING', ?)`,
      [crypto.randomUUID(), id, userId, now],
    );
    this.logEvent(userId, 'ROOM_JOINED', null, cleanName, { roomId: id, code, role: 'HOST' });
    const unlocked = this.evaluateAchievements(userId);
    this.persist();
    return { room: this.listRooms(userId).find((r) => r.id === id), unlocked };
  }

  joinRoom(userId, { roomId, code }) {
    const room = roomId
      ? this.get('SELECT * FROM Room WHERE id = ?', [roomId])
      : this.get('SELECT * FROM Room WHERE UPPER(code) = UPPER(?)', [String(code || '').trim()]);
    if (!room) throw new Error('Focus room not found.');

    const existing = this.get('SELECT id FROM RoomParticipant WHERE room_id = ? AND user_id = ?', [room.id, userId]);
    if (!existing) {
      const countRow = this.get('SELECT COUNT(*) AS cnt FROM RoomParticipant WHERE room_id = ?', [room.id]);
      if (Number(countRow.cnt) >= Number(room.max_participants)) {
        throw new Error('This focus room is currently full.');
      }
      this.run(
        `INSERT INTO RoomParticipant (id, room_id, user_id, role, status, joined_at)
         VALUES (?, ?, ?, 'MEMBER', 'FOCUSING', ?)`,
        [crypto.randomUUID(), room.id, userId, new Date().toISOString()],
      );
      this.logEvent(userId, 'ROOM_JOINED', null, room.name, { roomId: room.id, code: room.code });
    }
    const unlocked = this.evaluateAchievements(userId);
    this.persist();
    return { room: this.listRooms(userId).find((r) => r.id === room.id), unlocked };
  }

  leaveRoom(userId, roomId) {
    this.run('DELETE FROM RoomParticipant WHERE room_id = ? AND user_id = ?', [roomId, userId]);
    this.persist();
    return { ok: true };
  }

  // --- Focus Sessions ---
  startSession(userId, { title, plannedMinutes, roomId }) {
    const cleanTitle = String(title || 'Deep Focus Session').trim() || 'Deep Focus Session';
    const mins = Math.max(1, Math.min(180, Math.round(Number(plannedMinutes) || 25)));
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.run(
      `INSERT INTO FocusSession (id, user_id, room_id, title, planned_minutes, actual_minutes, status, points_earned, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, 0, 'ACTIVE', 0, ?, NULL)`,
      [id, userId, roomId || null, cleanTitle, mins, now],
    );
    this.logEvent(userId, 'SESSION_STARTED', id, cleanTitle, { plannedMinutes: mins, roomId: roomId || null });
    this.persist();
    return this.getSessionById(id);
  }

  getSessionById(sessionId) {
    const s = this.get(
      `SELECT fs.*, r.name AS room_name
       FROM FocusSession fs
       LEFT JOIN Room r ON r.id = fs.room_id
       WHERE fs.id = ?`,
      [sessionId],
    );
    if (!s) return null;
    return {
      id: s.id,
      userId: s.user_id,
      roomId: s.room_id,
      roomName: s.room_name || null,
      title: s.title,
      plannedMinutes: Number(s.planned_minutes),
      actualMinutes: Number(s.actual_minutes),
      status: s.status,
      pointsEarned: Number(s.points_earned),
      startedAt: s.started_at,
      endedAt: s.ended_at,
    };
  }

  updateSessionStatus(userId, sessionId, status) {
    this.run('UPDATE FocusSession SET status = ? WHERE id = ? AND user_id = ?', [status, sessionId, userId]);
    if (status === 'PAUSED') this.logEvent(userId, 'SESSION_PAUSED', sessionId);
    if (status === 'ACTIVE') this.logEvent(userId, 'SESSION_RESUMED', sessionId);
    this.persist();
    return this.getSessionById(sessionId);
  }

  completeSession(userId, sessionId, actualMinutes, cancelled = false) {
    const session = this.getSessionById(sessionId);
    if (!session) throw new Error('Session not found.');
    const mins = Math.max(cancelled ? 0 : 1, Math.round(Number(actualMinutes) || session.plannedMinutes));
    const status = cancelled ? 'CANCELLED' : 'COMPLETED';
    const pointsEarned = cancelled ? 0 : Math.max(10, mins * 2);
    const now = new Date().toISOString();

    this.run(
      `UPDATE FocusSession
       SET actual_minutes = ?, status = ?, points_earned = ?, ended_at = ?
       WHERE id = ? AND user_id = ?`,
      [mins, status, pointsEarned, now, sessionId, userId],
    );

    if (cancelled) {
      this.logEvent(userId, 'SESSION_CANCELLED', sessionId, session.title, { actualMinutes: mins });
      this.persist();
      return { session: this.getSessionById(sessionId), pointsEarned: 0, unlocked: [] };
    }

    this.logEvent(userId, 'SESSION_COMPLETED', sessionId, session.title, { actualMinutes: mins, pointsEarned });
    this.recordPoints(userId, pointsEarned, `Completed ${mins}m focus session: ${session.title}`, sessionId, null);
    const unlocked = this.evaluateAchievements(userId);
    this.persist();
    return { session: this.getSessionById(sessionId), pointsEarned, unlocked };
  }

  listSessions(userId, limit = 25) {
    const rows = this.all(
      `SELECT fs.*, r.name AS room_name
       FROM FocusSession fs
       LEFT JOIN Room r ON r.id = fs.room_id
       WHERE fs.user_id = ?
       ORDER BY fs.started_at DESC
       LIMIT ?`,
      [userId, limit],
    );
    return rows.map((s) => ({
      id: s.id,
      userId: s.user_id,
      roomId: s.room_id,
      roomName: s.room_name || null,
      title: s.title,
      plannedMinutes: Number(s.planned_minutes),
      actualMinutes: Number(s.actual_minutes),
      status: s.status,
      pointsEarned: Number(s.points_earned),
      startedAt: s.started_at,
      endedAt: s.ended_at,
    }));
  }

  listEvents(userId, limit = 40) {
    return this.all(
      `SELECT * FROM FocusEvent WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit],
    ).map((e) => ({
      id: e.id,
      sessionId: e.session_id,
      userId: e.user_id,
      eventType: e.event_type,
      resourceLabel: e.resource_label,
      metadata: (() => {
        try {
          return JSON.parse(e.metadata_json || '{}');
        } catch {
          return {};
        }
      })(),
      createdAt: e.created_at,
    }));
  }

  // --- Blocked Resources ---
  listBlockedResources(userId) {
    return this.all(
      `SELECT * FROM BlockedResource WHERE user_id = ? ORDER BY created_at DESC`,
      [userId],
    ).map((b) => ({
      id: b.id,
      userId: b.user_id,
      domainOrApp: b.domain_or_app,
      category: b.category,
      isEnabled: Boolean(b.is_enabled),
      blockCount: Number(b.block_count),
      createdAt: b.created_at,
    }));
  }

  addBlockedResource(userId, { domainOrApp, category }) {
    const clean = normalizeResource(domainOrApp);
    if (!clean) throw new Error('Enter a valid website domain or app name.');
    const existing = this.get(
      'SELECT id FROM BlockedResource WHERE user_id = ? AND domain_or_app = ?',
      [userId, clean],
    );
    if (existing) throw new Error(`"${clean}" is already in your blocklist.`);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.run(
      `INSERT INTO BlockedResource (id, user_id, domain_or_app, category, is_enabled, block_count, created_at)
       VALUES (?, ?, ?, ?, 1, 0, ?)`,
      [id, userId, clean, String(category || 'Social').trim(), now],
    );
    this.persist();
    return this.listBlockedResources(userId).find((b) => b.id === id);
  }

  toggleBlockedResource(userId, resourceId, isEnabled) {
    this.run(
      'UPDATE BlockedResource SET is_enabled = ? WHERE id = ? AND user_id = ?',
      [isEnabled ? 1 : 0, resourceId, userId],
    );
    this.persist();
    return this.listBlockedResources(userId).find((b) => b.id === resourceId);
  }

  removeBlockedResource(userId, resourceId) {
    this.run('DELETE FROM BlockedResource WHERE id = ? AND user_id = ?', [resourceId, userId]);
    this.persist();
    return { ok: true };
  }

  checkDistraction(userId, targetInput, activeSessionId = null) {
    const normalized = normalizeResource(targetInput);
    if (!normalized) return { blocked: false, resource: null, unlocked: [] };

    const enabled = this.listBlockedResources(userId).filter((r) => r.isEnabled);
    const match = enabled.find(
      (r) => normalized === r.domainOrApp || normalized.endsWith(`.${r.domainOrApp}`) || normalized.includes(r.domainOrApp),
    );
    if (!match) return { blocked: false, resource: null, unlocked: [] };

    this.run(
      'UPDATE BlockedResource SET block_count = block_count + 1 WHERE id = ? AND user_id = ?',
      [match.id, userId],
    );
    this.logEvent(userId, 'DISTRACTION_BLOCKED', activeSessionId, match.domainOrApp, {
      category: match.category,
      input: targetInput,
    });
    this.recordPoints(userId, 5, `Resisted distraction: ${match.domainOrApp}`, activeSessionId, null);
    const unlocked = this.evaluateAchievements(userId);
    this.persist();

    return {
      blocked: true,
      resource: this.listBlockedResources(userId).find((r) => r.id === match.id),
      unlocked,
    };
  }

  // --- Gamification ---
  getGamification(userId) {
    const stats = this.getUserStats(userId);
    const achievements = this.all(
      `SELECT a.*, ua.unlocked_at
       FROM Achievement a
       LEFT JOIN UserAchievement ua ON ua.achievement_id = a.id AND ua.user_id = ?
       ORDER BY (ua.unlocked_at IS NULL) ASC, a.points_reward ASC`,
      [userId],
    ).map((a) => {
      let current = 0;
      if (a.criteria_type === 'SESSIONS_COMPLETED') current = stats.completedSessions;
      else if (a.criteria_type === 'TOTAL_MINUTES') current = stats.totalFocusMinutes;
      else if (a.criteria_type === 'DISTRACTIONS_BLOCKED') current = stats.totalBlockedCount;
      else if (a.criteria_type === 'ROOMS_JOINED') current = stats.roomsJoined;
      else if (a.criteria_type === 'TOTAL_POINTS') current = stats.points;

      return {
        id: a.id,
        code: a.code,
        title: a.title,
        description: a.description,
        icon: a.icon,
        pointsReward: Number(a.points_reward),
        criteriaType: a.criteria_type,
        criteriaValue: Number(a.criteria_value),
        currentValue: current,
        unlocked: Boolean(a.unlocked_at),
        unlockedAt: a.unlocked_at || null,
      };
    });

    const transactions = this.all(
      `SELECT * FROM PointTransaction WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [userId],
    ).map((t) => ({
      id: t.id,
      userId: t.user_id,
      sessionId: t.session_id,
      achievementId: t.achievement_id,
      delta: Number(t.delta),
      reason: t.reason,
      balanceAfter: Number(t.balance_after),
      createdAt: t.created_at,
    }));

    return { stats, achievements, transactions };
  }

  getDashboard(userId) {
    return {
      user: this.getUserById(userId),
      stats: this.getUserStats(userId),
      recentSessions: this.listSessions(userId, 8),
      recentEvents: this.listEvents(userId, 15),
    };
  }
}

module.exports = { ZenithDatabase, DEFAULT_SETTINGS };
