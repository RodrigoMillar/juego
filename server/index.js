import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 3001;
const MAX_PLAYERS = 6;
const LAPS = 3;
const POINT_BUDGET = 8;
const FINISH_GRACE_MS = 20_000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true },
  maxHttpBufferSize: 100_000,
});

/** @type {Map<string, Room>} */
const rooms = new Map();

/**
 * @typedef {{id:string,name:string,car:object,ready:boolean,finished:boolean,finishTime:number|null,progress:number}} Player
 * @typedef {{code:string,hostId:string,state:'lobby'|'racing'|'results',laps:number,players:Map<string,Player>,startAt:number,finishOrder:Array<{id:string,time:number|null}>,trackSeed:number,endTimer:ReturnType<typeof setTimeout>|null}} Room
 */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const AVATAR_RE = /^pilots\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp)$/i;
const OLD_BODY_PURPLE = '#8b5cf6';
const CAR_MODELS = [
  'lada',
  'fiat',
  'chevette',
  'luv',
  'cavalier',
  'beetle',
  'falcon',
  'ritmo',
  'd21',
  'v16',
  'ambulancia',
  'bus',
  'fiorino',
  'variant',
];
const CAR_FINISHES = ['gloss', 'matte', 'metal'];

function clampInt(value, min, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function makeCode() {
  let code = '';
  do {
    code = Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function sanitizeName(raw) {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 16);
  return name || 'Piloto';
}

function sanitizeCar(input) {
  const source = input && typeof input === 'object' ? input : {};
  const car = {
    model: CAR_MODELS.includes(source.model) ? source.model : 'lada',
    color:
      typeof source.color === 'string' &&
      HEX_RE.test(source.color) &&
      source.color.toLowerCase() !== OLD_BODY_PURPLE
        ? source.color
        : '#000000',
    accent: typeof source.accent === 'string' && HEX_RE.test(source.accent) ? source.accent : '#ff3ea5',
    style: clampInt(source.style, 0, 2),
    finish: CAR_FINISHES.includes(source.finish) ? source.finish : 'gloss',
    character: sanitizeCharacter(source.character),
    speed: clampInt(source.speed, 0, 5),
    accel: clampInt(source.accel, 0, 5),
    grip: clampInt(source.grip, 0, 5),
  };

  const trimOrder = ['grip', 'accel', 'speed'];
  while (car.speed + car.accel + car.grip > POINT_BUDGET) {
    const key = trimOrder.find((candidate) => car[candidate] > 0);
    if (!key) break;
    car[key] -= 1;
  }
  return car;
}

function sanitizeCharacter(input) {
  const source = input && typeof input === 'object' ? input : {};
  const hex = (value, fallback) => (typeof value === 'string' && HEX_RE.test(value) ? value : fallback);
  const name = sanitizeName(source.name);
  const style = clampInt(source.hairStyle, 0, 3);
  const avatar =
    typeof source.avatar === 'string' && AVATAR_RE.test(source.avatar) ? source.avatar : undefined;
  return {
    name,
    skin: hex(source.skin, '#f1c27d'),
    hair: hex(source.hair, '#3b2f2f'),
    eyes: hex(source.eyes, '#2b6cb0'),
    hairStyle: style,
    ...(avatar ? { avatar } : {}),
  };
}
function sanitizeState(input) {
  const source = input && typeof input === 'object' ? input : {};
  const num = (value, min, max, fallback = 0) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  };
  return {
    x: num(source.x, -3000, 3000),
    z: num(source.z, -3000, 3000),
    heading: num(source.heading, -Math.PI * 8, Math.PI * 8),
    speed: num(source.speed, -200, 400),
    progress: num(source.progress, 0, 10_000),
    lap: num(source.lap, 1, 999, 1),
    finished: Boolean(source.finished),
  };
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    car: player.car,
    ready: player.ready,
    finished: player.finished,
    time: player.finishTime,
  };
}

function roomView(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    state: room.state,
    laps: room.laps,
    players: [...room.players.values()].map(publicPlayer),
  };
}

function broadcastRoom(room) {
  io.to(room.code).emit('room:update', roomView(room));
}

function getRoomOf(socket) {
  const code = socket.data.code;
  if (!code) return null;
  return rooms.get(code) ?? null;
}

function addPlayer(socket, room, payload) {
  const player = {
    id: socket.id,
    name: sanitizeName(payload?.name),
    car: sanitizeCar(payload?.car),
    ready: false,
    finished: false,
    finishTime: null,
    progress: 0,
  };
  room.players.set(socket.id, player);
  socket.data.code = room.code;
  socket.join(room.code);
  return player;
}

function removePlayer(socket) {
  const room = getRoomOf(socket);
  socket.data.code = null;
  if (!room) return;

  room.players.delete(socket.id);
  socket.leave(room.code);

  if (room.players.size === 0) {
    if (room.endTimer) clearTimeout(room.endTimer);
    rooms.delete(room.code);
    return;
  }

  if (room.hostId === socket.id) {
    room.hostId = room.players.keys().next().value;
  }

  if (room.state === 'racing') {
    const remaining = [...room.players.values()];
    if (remaining.every((player) => player.finished)) {
      endRace(room);
      return;
    }
  }

  broadcastRoom(room);
}

function startRace(room) {
  room.state = 'racing';
  room.startAt = Date.now() + 5000;
  room.finishOrder = [];
  if (room.endTimer) {
    clearTimeout(room.endTimer);
    room.endTimer = null;
  }

  for (const player of room.players.values()) {
    player.ready = false;
    player.finished = false;
    player.finishTime = null;
    player.progress = 0;
  }

  broadcastRoom(room);
  io.to(room.code).emit('race:start', {
    startAt: room.startAt,
    serverNow: Date.now(),
    trackSeed: room.trackSeed,
    laps: room.laps,
    players: [...room.players.values()].map(publicPlayer),
  });
}

function endRace(room) {
  if (!rooms.has(room.code) || room.state === 'results') return;
  if (room.endTimer) {
    clearTimeout(room.endTimer);
    room.endTimer = null;
  }
  room.state = 'results';

  const ordered = [...room.players.values()].sort((a, b) => {
    if (a.finished && b.finished) return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });

  const results = ordered.map((player, index) => ({
    place: index + 1,
    id: player.id,
    name: player.name,
    time: player.finishTime,
    car: player.car,
  }));

  io.to(room.code).emit('race:results', { results, laps: room.laps });
  broadcastRoom(room);
}

// ---------------------------------------------------------------------------
// Eventos de socket
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  socket.on('room:create', (payload, ack) => {
    try {
      if (socket.data.code) removePlayer(socket);
      const room = {
        code: makeCode(),
        hostId: socket.id,
        state: 'lobby',
        laps: LAPS,
        players: new Map(),
        startAt: 0,
        finishOrder: [],
        trackSeed: Math.floor(Math.random() * 1_000_000_000),
        endTimer: null,
      };
      rooms.set(room.code, room);
      addPlayer(socket, room, payload);
      broadcastRoom(room);
      if (typeof ack === 'function') ack({ ok: true, room: roomView(room) });
    } catch (error) {
      console.error('room:create', error);
      if (typeof ack === 'function') ack({ ok: false, error: 'No se pudo crear la sala.' });
    }
  });

  socket.on('room:join', (payload, ack) => {
    try {
      const code = String(payload?.code ?? '').trim().toUpperCase();
      const room = rooms.get(code);
      const fail = (error) => {
        if (typeof ack === 'function') ack({ ok: false, error });
      };

      if (!room) return fail('Esa sala no existe. Revisa el código.');
      if (room.state !== 'lobby') return fail('La carrera ya comenzó en esa sala.');
      if (room.players.size >= MAX_PLAYERS) return fail(`La sala está llena (máximo ${MAX_PLAYERS}).`);

      if (socket.data.code) removePlayer(socket);
      addPlayer(socket, room, payload);
      broadcastRoom(room);
      if (typeof ack === 'function') ack({ ok: true, room: roomView(room) });
      return undefined;
    } catch (error) {
      console.error('room:join', error);
      if (typeof ack === 'function') ack({ ok: false, error: 'No se pudo entrar a la sala.' });
      return undefined;
    }
  });

  socket.on('player:car', (payload) => {
    const room = getRoomOf(socket);
    if (!room || room.state !== 'lobby') return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.car = sanitizeCar(payload?.car);
    broadcastRoom(room);
  });

  socket.on('player:ready', (payload) => {
    const room = getRoomOf(socket);
    if (!room || room.state !== 'lobby') return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.ready = Boolean(payload?.ready);
    broadcastRoom(room);
  });

  socket.on('room:start', (_payload, ack) => {
    const room = getRoomOf(socket);
    const reject = (error) => {
      if (typeof ack === 'function') ack({ ok: false, error });
    };

    if (!room) return reject('No estás en una sala.');
    if (room.hostId !== socket.id) return reject('Solo el anfitrión puede iniciar la carrera.');
    if (room.state !== 'lobby') return reject('La carrera ya está en marcha.');

    const allReady = [...room.players.values()].every(
      (player) => player.id === room.hostId || player.ready,
    );
    if (!allReady) return reject('Faltan pilotos por marcar «listo».');

    startRace(room);
    if (typeof ack === 'function') ack({ ok: true });
    return undefined;
  });

  socket.on('race:state', (payload) => {
    const room = getRoomOf(socket);
    if (!room || room.state !== 'racing') return;
    const player = room.players.get(socket.id);
    if (!player) return;

    const state = sanitizeState(payload);
    player.progress = state.progress;
    socket.to(room.code).volatile.emit('race:peer', { id: socket.id, state });
  });

  socket.on('race:finish', (payload) => {
    const room = getRoomOf(socket);
    if (!room || room.state !== 'racing') return;
    const player = room.players.get(socket.id);
    if (!player || player.finished) return;

    const time = Number(payload?.time);
    player.finished = true;
    player.finishTime = Number.isFinite(time) && time > 0 ? Math.min(time, 3600) : null;
    room.finishOrder.push({ id: player.id, time: player.finishTime });

    io.to(room.code).emit('race:finish', {
      id: player.id,
      name: player.name,
      time: player.finishTime,
    });

    const everyoneFinished = [...room.players.values()].every((other) => other.finished);
    if (everyoneFinished) {
      endRace(room);
      return;
    }
    if (!room.endTimer) {
      room.endTimer = setTimeout(() => {
        const current = rooms.get(room.code);
        if (current) endRace(current);
      }, FINISH_GRACE_MS);
    }
  });

  socket.on('race:again', () => {
    const room = getRoomOf(socket);
    if (!room || room.hostId !== socket.id || room.state !== 'results') return;

    room.state = 'lobby';
    room.startAt = 0;
    room.finishOrder = [];
    if (room.endTimer) {
      clearTimeout(room.endTimer);
      room.endTimer = null;
    }
    for (const player of room.players.values()) {
      player.ready = false;
      player.finished = false;
      player.finishTime = null;
      player.progress = 0;
    }
    broadcastRoom(room);
  });

  socket.on('room:leave', () => {
    removePlayer(socket);
  });

  socket.on('disconnect', () => {
    removePlayer(socket);
  });
});

// ---------------------------------------------------------------------------
// Estáticos (build de producción)
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size,
    players: [...rooms.values()].reduce((sum, room) => sum + room.players.size, 0),
  });
});

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || !req.accepts('html')) return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io') || req.path.startsWith('/music/')) return next();
    return res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

function lanAddress() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return null;
}

httpServer.listen(PORT, () => {
  const lan = lanAddress();
  console.log(`\n  Puente Alto Street Racing server escuchando en http://localhost:${PORT}`);
  if (lan) console.log(`  En tu red local: http://${lan}:${PORT}  (tras ejecutar npm run build)\n`);
});

process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0));
});
