const http = require('node:http');
const https = require('node:https');

class RoomSyncClient {
  constructor({ url = 'http://127.0.0.1:4123', onRoomsUpdated, onConnectionChange }) {
    this.url = url.replace(/\/$/, '');
    this.onRoomsUpdated = onRoomsUpdated;
    this.onConnectionChange = onConnectionChange;
    this.connected = false;
    this.streamReq = null;
    this.reconnectTimer = null;
    this.stopped = false;
  }

  setUrl(nextUrl) {
    this.url = String(nextUrl || '').trim().replace(/\/$/, '');
    this.disconnect();
    if (this.url) this.connect();
  }

  getStatus() {
    return { url: this.url, connected: this.connected };
  }

  setConnected(flag) {
    if (this.connected !== flag) {
      this.connected = flag;
      this.onConnectionChange?.(this.getStatus());
    }
  }

  async request(method, pathname, body) {
    if (!this.url) return null;
    const res = await fetch(`${this.url}${pathname}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Sync request failed (${res.status})`);
    }
    return await res.json();
  }

  async listRooms(userId) {
    return await this.request('GET', `/rooms?userId=${encodeURIComponent(userId || '')}`);
  }

  async createRoom(payload) {
    return await this.request('POST', '/rooms', payload);
  }

  async joinRoom(payload) {
    return await this.request('POST', '/rooms/join', payload);
  }

  async leaveRoom(payload) {
    return await this.request('POST', '/rooms/leave', payload);
  }

  async updateStatus(payload) {
    return await this.request('POST', '/rooms/status', payload);
  }

  connect() {
    if (!this.url || this.stopped) return;
    this.disconnectStream();

    let parsed;
    try {
      parsed = new URL(`${this.url}/rooms/stream`);
    } catch {
      this.setConnected(false);
      return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(
      parsed,
      { headers: { Accept: 'text/event-stream' } },
      (res) => {
        if (res.statusCode !== 200) {
          this.setConnected(false);
          this.scheduleReconnect();
          return;
        }
        this.setConnected(true);
        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buffer += chunk;
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const frame of parts) {
            const dataLine = frame
              .split('\n')
              .find((l) => l.startsWith('data: '));
            if (dataLine) {
              try {
                const payload = JSON.parse(dataLine.slice(6));
                this.onRoomsUpdated?.(payload);
              } catch {}
            }
          }
        });
        res.on('end', () => {
          this.setConnected(false);
          this.scheduleReconnect();
        });
      },
    );

    req.on('error', () => {
      this.setConnected(false);
      this.scheduleReconnect();
    });
    this.streamReq = req;
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  disconnectStream() {
    if (this.streamReq) {
      this.streamReq.destroy();
      this.streamReq = null;
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.disconnectStream();
    this.setConnected(false);
  }

  destroy() {
    this.stopped = true;
    this.disconnect();
  }
}

module.exports = { RoomSyncClient };
