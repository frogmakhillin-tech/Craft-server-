const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
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

wss.on('connection', ws => {
  ws.room = null;

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'create') {
      if (ws.room) return;
      const code = makeCode();
      rooms.set(code, [ws]);
      ws.room = code;
      ws.send(JSON.stringify({ t: 'created', code }));
    } else if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room || room.length !== 1 || ws.room) {
        ws.send(JSON.stringify({ t: 'err', msg: 'Room not found or full' }));
        return;
      }
      room.push(ws);
      ws.room = code;
      ws.send(JSON.stringify({ t: 'joined', code }));
      room[0].send(JSON.stringify({ t: 'peer' }));
    } else if (ws.room) {
      const room = rooms.get(ws.room);
      if (!room) return;
      for (const o of room) {
        if (o !== ws && o.readyState === 1) o.send(raw.toString());
      }
    }
  });

  ws.on('close', () => {
    if (!ws.room) return;
    const room = rooms.get(ws.room);
    if (!room) return;
    for (const o of room) {
      if (o !== ws && o.readyState === 1) o.send(JSON.stringify({ t: 'left' }));
    }
    rooms.delete(ws.room);
  });
});