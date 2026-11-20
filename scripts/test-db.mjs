import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ZenithDatabase } = require('../electron/database.cjs');

const tmpFile = path.join(os.tmpdir(), `zenith-test-${Date.now()}.sqlite`);

try {
  const db = await new ZenithDatabase(tmpFile).init();

  // 1. Demo user seeded & login works
  const demo = db.login({ identifier: 'demo', password: 'zenith123' });
  if (demo.username !== 'demo') throw new Error('Demo login failed');

  // 2. Register new user & enforce UNIQUE username/email
  const alice = db.register({
    username: 'alice',
    email: 'alice@example.com',
    password: 'password123',
    displayName: 'Alice Chen',
  });
  let dupFailed = false;
  try {
    db.register({ username: 'alice', email: 'other@example.com', password: 'password123' });
  } catch {
    dupFailed = true;
  }
  if (!dupFailed) throw new Error('UNIQUE username constraint not enforced');

  // 3. Create & join room
  const { room } = db.createRoom(alice.id, { name: 'Thesis Sprint', topic: 'Research', description: 'Quiet writing' });
  if (!room || room.participantCount !== 1) throw new Error('Room creation failed');
  db.joinRoom(demo.id, { code: room.code });
  const rooms = db.listRooms(demo.id);
  const updated = rooms.find((r) => r.id === room.id);
  if (!updated || updated.participantCount !== 2) throw new Error('RoomParticipant join failed');

  // 4. Focus session + distraction check + completion + points + achievements
  const session = db.startSession(alice.id, { title: 'Write Chapter 2', plannedMinutes: 30, roomId: room.id });
  const check = db.checkDistraction(alice.id, 'https://www.youtube.com/watch?v=123', session.id);
  if (!check.blocked || check.resource.blockCount !== 1) throw new Error('Distraction blocker failed');

  const done = db.completeSession(alice.id, session.id, 30, false);
  if (done.pointsEarned !== 60) throw new Error(`Expected 60 pts, got ${done.pointsEarned}`);

  const gamification = db.getGamification(alice.id);
  if (gamification.transactions.length < 2) throw new Error('PointTransaction records missing');
  if (!gamification.achievements.some((a) => a.code === 'FIRST_FOCUS' && a.unlocked)) {
    throw new Error('FIRST_FOCUS achievement did not unlock');
  }

  // 5. Foreign key check (invalid user_id must fail)
  let fkFailed = false;
  try {
    db.run(
      `INSERT INTO BlockedResource (id, user_id, domain_or_app, category, is_enabled, block_count, created_at)
       VALUES ('bad', 'nonexistent-user', 'test.com', 'Social', 1, 0, '2026-01-01')`,
    );
  } catch {
    fkFailed = true;
  }
  if (!fkFailed) throw new Error('FOREIGN KEY constraint not enforced');

  console.log('ALL_ZENITH_DB_TESTS_PASSED');
} finally {
  fs.rmSync(tmpFile, { force: true });
}
