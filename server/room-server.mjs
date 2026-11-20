import crypto from 'node:crypto';
import http from 'node:http';

const PORT = Number(process.env.SYNC_PORT || 4123);
const HOST = process.env.SYNC_HOST || '0.0.0.0';

const rooms = [
  {
    id: 'shared-study-1',
    code: 'ZEN-LIVE',
    name: 'Global Deep Work Hall',
    description: 'Live multi-device collaborative focus room synced over SSE.',
    topic: 'Study',
    hostUserId: 'system',
    hostName: 'Zenith Host',
    isActive: true,
    maxParticipants: 25,
    createdAt: new Date().toISOString(),
    participants: [],
  },
];

const sseClients = new Set();

function broadcastRooms() {
  const payload = `data: ${JSON.stringify({ type: 'rooms:updated', timestamp: new Date().toISOString() })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function formatRoom(room, userId) {
  return {
    ...room,
    participantCount: room.participants.length,
    isJoined: Boolean(userId && room.participants.some((p) => p.userId === userId)),
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, rooms: rooms.length, clients: sseClients.size });
  }

  if (req.method === 'GET' && url.pathname === '/rooms/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/rooms') {
    const userId = url.searchParams.get('userId') || '';
    return sendJson(
      res,
      200,
      rooms.map((r) => formatRoom(r, userId)),
    );
  }

  try {
    const body = await readJson(req);

    if (req.method === 'POST' && url.pathname === '/rooms') {
      const { userId, displayName, username, name, description, topic, maxParticipants } = body;
      if (!name?.trim()) return sendJson(res, 400, { message: 'Room name is required' });
      const room = {
        id: crypto.randomUUID(),
        code: `ZEN-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        name: name.trim(),
        description: String(description || '').trim(),
        topic: String(topic || 'Deep Work').trim(),
        hostUserId: userId,
        hostName: displayName || username || 'Host',
        isActive: true,
        maxParticipants: Math.max(2, Math.min(50, Number(maxParticipants) || 12)),
        createdAt: new Date().toISOString(),
        participants: [
          {
            id: crypto.randomUUID(),
            userId,
            role: 'HOST',
            status: 'FOCUSING',
            joinedAt: new Date().toISOString(),
            displayName: displayName || username || 'Host',
            username: username || 'host',
          },
        ],
      };
      rooms.unshift(room);
      broadcastRooms();
      return sendJson(res, 201, formatRoom(room, userId));
    }

    if (req.method === 'POST' && url.pathname === '/rooms/join') {
      const { userId, displayName, username, roomId, code } = body;
      const room = roomId
        ? rooms.find((r) => r.id === roomId)
        : rooms.find((r) => r.code.toUpperCase() === String(code || '').trim().toUpperCase());
      if (!room) return sendJson(res, 404, { message: 'Shared focus room not found' });

      if (!room.participants.some((p) => p.userId === userId)) {
        if (room.participants.length >= room.maxParticipants) {
          return sendJson(res, 400, { message: 'Room is full' });
        }
        room.participants.push({
          id: crypto.randomUUID(),
          userId,
          role: 'MEMBER',
          status: 'FOCUSING',
          joinedAt: new Date().toISOString(),
          displayName: displayName || username || 'Member',
          username: username || 'member',
        });
        broadcastRooms();
      }
      return sendJson(res, 200, formatRoom(room, userId));
    }

    if (req.method === 'POST' && url.pathname === '/rooms/leave') {
      const { userId, roomId } = body;
      const room = rooms.find((r) => r.id === roomId);
      if (room) {
        room.participants = room.participants.filter((p) => p.userId !== userId);
        broadcastRooms();
      }
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/rooms/status') {
      const { userId, status } = body;
      let changed = false;
      for (const room of rooms) {
        const p = room.participants.find((x) => x.userId === userId);
        if (p && p.status !== status) {
          p.status = status;
          changed = true;
        }
      }
      if (changed) broadcastRooms();
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { message: 'Route not found' });
  } catch (err) {
    return sendJson(res, 400, { message: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[zenith-sync] Live focus room sync server listening on http://${HOST}:${PORT}`);
});
