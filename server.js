const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const MAX = 8;
const wss = new WebSocketServer({ port: PORT });
const rooms = new Map();

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do {
    c = '';
    for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(c));
  return c;
}

function send(ws, o) {
  if (ws.readyState === 1) ws.send(JSON.stringify(o));
}

wss.on('connection', ws => {
  ws.room = null;
  ws.id = 0;
  ws.nick = '';

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'create') {
      if (ws.room) return;
      const code = makeCode();
      const r = { clients: new Map(), host: 1, next: 2 };
      ws.id = 1;
      ws.nick = String(m.n || 'P1').slice(0, 15);
      r.clients.set(1, ws);
      rooms.set(code, r);
      ws.room = code;
      send(ws, { t: 'created', code, id: 1 });
    } else if (m.t === 'join') {
      if (ws.room) return;
      const code = String(m.code || '').toUpperCase().trim();
      const r = rooms.get(code);
      if (!r) { send(ws, { t: 'err', msg: 'Room not found' }); return; }
      if (r.clients.size >= MAX) { send(ws, { t: 'err', msg: 'Room is full' }); return; }
      const id = r.next++;
      ws.id = id;
      ws.nick = String(m.n || 'P' + id).slice(0, 15);
      const players = [...r.clients.values()].map(c => ({ i: c.id, n: c.nick }));
      r.clients.set(id, ws);
      ws.room = code;
      send(ws, { t: 'joined', code, id, host: r.host, players });
      for (const c of r.clients.values()) {
        if (c !== ws) send(c, { t: 'peer', i: id, n: ws.nick });
      }
    } else if (ws.room) {
      const r = rooms.get(ws.room);
      if (!r) return;
      m.i = ws.id;
      const out = JSON.stringify(m);
      if (m.to) {
        const c = r.clients.get(m.to);
        if (c && c.readyState === 1) c.send(out);
      } else {
        for (const c of r.clients.values()) {
          if (c !== ws && c.readyState === 1) c.send(out);
        }
      }
    }
  });

  ws.on('close', () => {
    if (!ws.room) return;
    const r = rooms.get(ws.room);
    if (!r) return;
    r.clients.delete(ws.id);
    if (r.clients.size === 0) { rooms.delete(ws.room); return; }
    for (const c of r.clients.values()) send(c, { t: 'left', i: ws.id });
    if (r.host === ws.id) {
      r.host = Math.min(...r.clients.keys());
      for (const c of r.clients.values()) send(c, { t: 'host', i: r.host });
    }
  });
});
