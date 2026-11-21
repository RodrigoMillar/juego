import './style.css';
import { Game } from './game/Game';
import { GameAudio } from './audio/GameAudio';
import { GaragePreview } from './ui/GaragePreview';
import { request, socket } from './net';
import {
  CAR_FINISHES,
  CAR_MODELS,
  DEFAULT_CAR,
  MAX_STAT,
  POINT_BUDGET,
  carModelName,
  normalizeCar,
  sanitizeName,
} from './types';
import type {
  BodyStyle,
  CarConfig,
  CarFinish,
  HairStyle,
  HudState,
  PeerState,
  RaceStartPayload,
  ResultsPayload,
  RoomView,
} from './types';

const NAME_KEY = 'neonracer:name';
const CAR_KEY = 'neonracer:car';

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Falta el elemento ${selector}`);
  return element;
};

// ---------------------------------------------------------------------------
// Elementos
// ---------------------------------------------------------------------------
const gameCanvas = $<HTMLCanvasElement>('#game-canvas');
const hud = $('#hud');
const hudPos = $('#hud-pos');
const hudLap = $('#hud-lap');
const hudTime = $('#hud-time');
const hudSpeed = $('#hud-speed');
const hudOffroad = $('#hud-offroad');
const countdownEl = $('#countdown');

const screenMenu = $('#screen-menu');
const screenLobby = $('#screen-lobby');
const screenGarage = $('#screen-garage');
const screenResults = $('#screen-results');
const allScreens = [screenMenu, screenLobby, screenGarage, screenResults];

const inputName = $<HTMLInputElement>('#input-name');
const inputCode = $<HTMLInputElement>('#input-code');
const menuError = $('#menu-error');
const btnCreate = $<HTMLButtonElement>('#btn-create');
const btnJoin = $<HTMLButtonElement>('#btn-join');
const btnGarageMenu = $<HTMLButtonElement>('#btn-garage-menu');

const lobbyCode = $('#lobby-code');
const lobbyPlayers = $<HTMLUListElement>('#lobby-players');
const lobbyHint = $('#lobby-hint');
const btnCopy = $<HTMLButtonElement>('#btn-copy');
const btnReady = $<HTMLButtonElement>('#btn-ready');
const btnStart = $<HTMLButtonElement>('#btn-start');
const btnGarageLobby = $<HTMLButtonElement>('#btn-garage-lobby');
const btnLeaveLobby = $<HTMLButtonElement>('#btn-leave-lobby');

const resultsList = $<HTMLOListElement>('#results-list');
const btnAgain = $<HTMLButtonElement>('#btn-again');
const btnResultsLeave = $<HTMLButtonElement>('#btn-results-leave');

const garageCanvas = $<HTMLCanvasElement>('#garage-canvas');
const inputColor = $<HTMLInputElement>('#input-color');
const inputAccent = $<HTMLInputElement>('#input-accent');
const bodySwatches = $('#body-swatches');
const accentSwatches = $('#accent-swatches');
const modelButtons = $('#model-buttons');
const finishButtons = $('#finish-buttons');
const pilotPresets = $('#pilot-presets');
const styleButtons = $('#style-buttons');
const statsEl = $('#stats');
const pointsLeft = $('#points-left');
const btnGarageClose = $<HTMLButtonElement>('#btn-garage-close');
const btnGarageSave = $<HTMLButtonElement>('#btn-garage-save');

const btnMusic = $<HTMLButtonElement>('#btn-music');
const btnSound = $<HTMLButtonElement>('#btn-sound');
const btnAudioHud = $<HTMLButtonElement>('#btn-audio-hud');
const musicVolume = $<HTMLInputElement>('#music-volume');
const engineVolume = $<HTMLInputElement>('#engine-volume');
const audioSource = $('#audio-source');
const inputMusicFile = $<HTMLInputElement>('#input-music-file');

const btnQuitRace = $<HTMLButtonElement>('#btn-quit-race');
const toastEl = $('#toast');

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const garagePreview = new GaragePreview(garageCanvas);
const audio = new GameAudio();

let myName = (localStorage.getItem(NAME_KEY) ?? '').slice(0, 16);
let myCar = loadCar();
let draftCar: CarConfig = { ...myCar };
let room: RoomView | null = null;
let game: Game | null = null;
let garageOpen = false;
let pendingRequest = false;
let toastTimer = 0;
let connectionWarned = false;
let lastCountdown = '';

audio.onNotice = (message) => {
  if (message) toast(message);
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function loadCar(): CarConfig {
  try {
    const raw = localStorage.getItem(CAR_KEY);
    if (raw) return normalizeCar(JSON.parse(raw) as Partial<CarConfig>);
  } catch {
    // Ignora datos corruptos y usa el auto por defecto.
  }
  return { ...DEFAULT_CAR };
}

function show(element: HTMLElement): void {
  element.classList.remove('hidden');
}

function hide(element: HTMLElement): void {
  element.classList.add('hidden');
}

function hideScreens(): void {
  for (const screen of allScreens) hide(screen);
}

function toast(message: string): void {
  toastEl.textContent = message;
  show(toastEl);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => hide(toastEl), 3200);
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const millis = Math.floor((safe % 1) * 1000);
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function getName(): string {
  const name = sanitizeName(inputName.value);
  myName = name;
  localStorage.setItem(NAME_KEY, name);
  return name;
}

function isHost(): boolean {
  return Boolean(room && socket.id && room.hostId === socket.id);
}

function setMenuError(message: string | null): void {
  if (!message) {
    hide(menuError);
    menuError.textContent = '';
    return;
  }
  menuError.textContent = message;
  show(menuError);
}

// ---------------------------------------------------------------------------
// Navegación
// ---------------------------------------------------------------------------
function showMenu(): void {
  hideScreens();
  show(screenMenu);
  hide(hud);
  hide(gameCanvas);
}

function resetToMenu(message?: string): void {
  teardownGame();
  room = null;
  garageOpen = false;
  garagePreview.stop();
  hideScreens();
  show(screenMenu);
  hide(gameCanvas);
  if (message) toast(message);
}

function teardownGame(): void {
  if (game) {
    game.dispose();
    game = null;
  }
  hide(hud);
  hide(gameCanvas);
}

function resetHud(): void {
  hudPos.textContent = '1/1';
  hudLap.textContent = '1/3';
  hudTime.textContent = '0:00.000';
  hudSpeed.textContent = '0';
  hide(countdownEl);
  hide(hudOffroad);
}

// ---------------------------------------------------------------------------
// Garage
// ---------------------------------------------------------------------------
const BODY_COLORS = ['#22d3ee', '#ff3ea5', '#a3e635', '#f97316', '#8b5cf6', '#ef4444', '#facc15', '#e2e8f0'];
const ACCENT_COLORS = ['#ff3ea5', '#22d3ee', '#a3e635', '#ffffff', '#f97316', '#8b5cf6', '#facc15', '#ef4444'];
const STYLE_LABELS = ['Clásico', 'Deportivo', 'Rally'];
const STAT_DEFS: Array<{ key: 'speed' | 'accel' | 'grip'; label: string }> = [
  { key: 'speed', label: 'Velocidad punta' },
  { key: 'accel', label: 'Aceleración' },
  { key: 'grip', label: 'Agarre' },
];

function buildSwatches(container: HTMLElement, colors: string[], target: 'color' | 'accent'): void {
  container.innerHTML = '';
  for (const color of colors) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.dataset.color = color;
    button.dataset.target = target;
    button.style.setProperty('--swatch', color);
    button.title = color;
    button.setAttribute('aria-label', `Color ${color}`);
    container.appendChild(button);
  }
}

function buildGarageUi(): void {
  buildSwatches(bodySwatches, BODY_COLORS, 'color');
  buildSwatches(accentSwatches, ACCENT_COLORS, 'accent');

  modelButtons.innerHTML = '';
  for (const model of CAR_MODELS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'model-btn';
    button.dataset.model = model.id;
    const name = document.createElement('b');
    name.textContent = model.name;
    const year = document.createElement('span');
    year.textContent = model.year;
    button.append(name, year);
    modelButtons.appendChild(button);
  }

  finishButtons.innerHTML = '';
  for (const finish of CAR_FINISHES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'style-btn';
    button.dataset.finish = finish.id;
    button.textContent = finish.label;
    finishButtons.appendChild(button);
  }

  styleButtons.innerHTML = '';
  STYLE_LABELS.forEach((label, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'style-btn';
    button.dataset.style = String(index);
    button.textContent = label;
    styleButtons.appendChild(button);
  });

  for (const container of [bodySwatches, accentSwatches]) {
    container.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button.swatch');
      if (!button?.dataset.color || !button.dataset.target) return;
      draftCar[button.dataset.target as 'color' | 'accent'] = button.dataset.color;
      applyDraftVisual();
    });
  }

  modelButtons.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button.model-btn');
    if (!button?.dataset.model) return;
    draftCar.model = button.dataset.model as CarConfig['model'];
    applyDraftVisual();
  });

  finishButtons.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button.style-btn');
    if (!button?.dataset.finish) return;
    draftCar.finish = button.dataset.finish as CarFinish;
    applyDraftVisual();
  });

  styleButtons.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button.style-btn');
    if (!button?.dataset.style) return;
    draftCar.style = Number(button.dataset.style) as BodyStyle;
    applyDraftVisual();
  });

  pilotPresets.innerHTML = '';
  const presets = [
    { name: 'Luismi', photo: 'pilots/luismi.jpg', skin: '#f1c27d', hair: '#3b2f2f', eyes: '#2b6cb0', hairStyle: 1 },
    { name: 'Rolo', photo: 'pilots/rolo.jpg', skin: '#e0ac69', hair: '#1a1a1a', eyes: '#1f3b73', hairStyle: 2 },
    { name: 'Piwe', photo: 'pilots/piwe.jpg', skin: '#ffdbac', hair: '#8d5524', eyes: '#3d6b35', hairStyle: 3 },
    { name: 'Erwin', photo: 'pilots/erwin.jpg', skin: '#c68642', hair: '#000000', eyes: '#5a3825', hairStyle: 0 },
    { name: 'Tq-Leo', photo: 'pilots/tq-leo.jpg', skin: '#8d5524', hair: '#5a3825', eyes: '#2b6cb0', hairStyle: 1 },
  ];
  for (const preset of presets) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'preset-btn';

    const img = document.createElement('img');
    img.src = `${import.meta.env.BASE_URL}${preset.photo}`;
    img.alt = preset.name;
    img.className = 'preset-photo';
    button.appendChild(img);

    const label = document.createElement('span');
    label.textContent = preset.name;
    button.appendChild(label);

    button.addEventListener('click', () => {
      draftCar.character = { name: preset.name, skin: preset.skin, hair: preset.hair, eyes: preset.eyes, hairStyle: preset.hairStyle as HairStyle };
      applyDraftVisual();
      refreshGarage();
    });
    pilotPresets.appendChild(button);
  }

  inputColor.addEventListener('input', () => {
    draftCar.color = inputColor.value;
    applyDraftVisual();
  });

  inputAccent.addEventListener('input', () => {
    draftCar.accent = inputAccent.value;
    applyDraftVisual();
  });

  statsEl.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-stat]');
    if (!button?.dataset.stat || !button.dataset.delta) return;
    const key = button.dataset.stat as 'speed' | 'accel' | 'grip';
    const delta = Number(button.dataset.delta);
    const used = draftCar.speed + draftCar.accel + draftCar.grip;
    const next = draftCar[key] + delta;
    if (next < 0 || next > MAX_STAT) return;
    if (delta > 0 && used >= POINT_BUDGET) return;
    draftCar[key] = next;
    renderStats();
  });
}

function applyDraftVisual(): void {
  garagePreview.setCar(draftCar);
  refreshGarage();
}

function renderStats(): void {
  const used = draftCar.speed + draftCar.accel + draftCar.grip;
  pointsLeft.textContent = `${POINT_BUDGET - used} pts`;
  statsEl.innerHTML = '';

  for (const def of STAT_DEFS) {
    const value = draftCar[def.key];

    const row = document.createElement('div');
    row.className = 'stat-row';

    const head = document.createElement('div');
    head.className = 'stat-head';

    const label = document.createElement('span');
    label.textContent = def.label;

    const controls = document.createElement('div');
    controls.className = 'stat-controls';

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'stepper';
    minus.textContent = '−';
    minus.dataset.stat = def.key;
    minus.dataset.delta = '-1';
    minus.disabled = value <= 0;

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'stepper';
    plus.textContent = '+';
    plus.dataset.stat = def.key;
    plus.dataset.delta = '1';
    plus.disabled = value >= MAX_STAT || used >= POINT_BUDGET;

    controls.append(minus, plus);
    head.append(label, controls);

    const dots = document.createElement('div');
    dots.className = 'dots';
    for (let i = 0; i < MAX_STAT; i += 1) {
      const dot = document.createElement('span');
      dot.className = i < value ? 'dot on' : 'dot';
      dots.appendChild(dot);
    }

    row.append(head, dots);
    statsEl.appendChild(row);
  }
}

function refreshAudioUi(): void {
  const settings = audio.audioSettings;
  btnMusic.classList.toggle('active', settings.music);
  btnMusic.textContent = settings.music ? '♪ Música ON' : '♪ Música OFF';
  btnSound.classList.toggle('active', settings.engine);
  btnSound.textContent = settings.engine ? 'Motor ON' : 'Motor OFF';

  musicVolume.value = String(Math.round(settings.musicVolume * 100));
  engineVolume.value = String(Math.round(settings.engineVolume * 100));
  audioSource.textContent = audio.sourceLabel;
  btnAudioHud.textContent = settings.music || settings.engine ? '♪' : '✕';
}

function refreshGarage(): void {
  inputColor.value = draftCar.color;
  inputAccent.value = draftCar.accent;
  for (const swatch of screenGarage.querySelectorAll<HTMLButtonElement>('button.swatch')) {
    const target = swatch.dataset.target as 'color' | 'accent';
    swatch.classList.toggle(
      'active',
      (swatch.dataset.color ?? '').toLowerCase() === draftCar[target].toLowerCase(),
    );
  }

  for (const button of modelButtons.querySelectorAll<HTMLButtonElement>('button.model-btn')) {
    button.classList.toggle('active', button.dataset.model === draftCar.model);
  }

  for (const button of finishButtons.querySelectorAll<HTMLButtonElement>('button.style-btn')) {
    button.classList.toggle('active', button.dataset.finish === draftCar.finish);
  }

  for (const button of styleButtons.querySelectorAll<HTMLButtonElement>('button.style-btn')) {
    button.classList.toggle('active', Number(button.dataset.style) === draftCar.style);
  }

  renderStats();
}

function openGarage(): void {
  if (game) return;
  garageOpen = true;
  draftCar = { ...myCar };
  hideScreens();
  show(screenGarage);
  garagePreview.setCar(draftCar);
  garagePreview.start();
  refreshGarage();
}

function closeGarage(): void {
  garageOpen = false;
  garagePreview.stop();
  hide(screenGarage);
  if (room && room.state === 'lobby') {
    hideScreens();
    show(screenLobby);
  } else {
    hideScreens();
    show(screenMenu);
  }
}

function saveGarage(): void {
  myCar = normalizeCar(draftCar);
  localStorage.setItem(CAR_KEY, JSON.stringify(myCar));
  if (room) socket.emit('player:car', { car: myCar });
  closeGarage();
  toast('Auto guardado');
}

// ---------------------------------------------------------------------------
// Sala y carrera
// ---------------------------------------------------------------------------
function enterRoom(view: RoomView): void {
  room = view;
  updateLobby();
  if (garageOpen) return;
  hideScreens();
  show(screenLobby);
}

function applyRoom(view: RoomView): void {
  const previousState = room?.state;
  room = view;
  updateLobby();

  if (view.state === 'lobby') {
    if (game || previousState === 'results') {
      teardownGame();
      hide(screenResults);
    }
    if (!garageOpen) {
      hideScreens();
      show(screenLobby);
    }
  }
}

function updateLobby(): void {
  if (!room) return;
  lobbyCode.textContent = room.code;

  const hostId = room.hostId;
  const me = room.players.find((player) => player.id === socket.id);

  lobbyPlayers.innerHTML = '';
  for (const player of room.players) {
    const card = document.createElement('li');
    card.className = 'player-card';
    if (player.id === socket.id) card.classList.add('is-me');

    const dot = document.createElement('span');
    dot.className = 'car-dot';
    dot.style.background = player.car.color;
    dot.style.boxShadow = `0 0 14px ${player.car.color}`;

    const info = document.createElement('div');
    info.className = 'player-info';
    const name = document.createElement('b');
    name.textContent = player.name + (player.id === socket.id ? ' (tú)' : '');
    const sub = document.createElement('span');
    sub.className = 'player-sub';
    sub.textContent = `${carModelName(player.car.model)} · ${player.id === hostId ? 'Anfitrión' : 'Piloto'}`;
    info.append(name, sub);

    const status = document.createElement('span');
    status.className = 'player-status';
    if (player.id === hostId) {
      status.textContent = '👑';
    } else if (player.ready) {
      status.textContent = 'LISTO';
      status.classList.add('ready');
    } else {
      status.textContent = 'ESPERANDO';
    }

    card.append(dot, info, status);
    lobbyPlayers.appendChild(card);
  }

  const host = isHost();
  btnReady.classList.toggle('hidden', host);
  if (me) btnReady.textContent = me.ready ? 'No estoy listo' : 'Estoy listo';

  const allReady = room.players.every((player) => player.id === hostId || player.ready);
  btnStart.classList.toggle('hidden', !host);
  btnStart.disabled = !allReady;

  if (host) {
    lobbyHint.textContent = allReady
      ? 'Todo listo. Pulsa «Iniciar carrera» cuando quieras.'
      : 'Espera a que todos los pilotos estén listos.';
  } else {
    lobbyHint.textContent = me?.ready
      ? 'Listo. Esperando a que el anfitrión inicie la carrera…'
      : 'Marca «Estoy listo» para avisar al anfitrión.';
  }
}

function renderHud(state: HudState): void {
  hudPos.textContent = `${state.position}/${state.players}`;
  hudLap.textContent = `${state.lap}/${state.totalLaps}`;
  hudTime.textContent = formatTime(state.time);
  hudSpeed.textContent = String(state.speed);
  hudOffroad.classList.toggle('hidden', !state.offroad);

  if (state.countdown) {
    if (state.countdown !== lastCountdown) {
      audio.countdownBeep(state.countdown === '¡GO!');
      lastCountdown = state.countdown;
    }
    countdownEl.textContent = state.countdown;
    countdownEl.classList.toggle('go', state.countdown === '¡GO!');
    show(countdownEl);
  } else {
    hide(countdownEl);
  }
}

function startRace(payload: RaceStartPayload): void {
  if (!socket.id) return;
  const me = payload.players.find((player) => player.id === socket.id);
  if (!me) return;

  garageOpen = false;
  garagePreview.stop();
  hide(screenGarage);
  teardownGame();
  hide(screenResults);

  if (room) room = { ...room, state: 'racing' };

  hideScreens();
  resetHud();
  show(gameCanvas);
  show(hud);

  const clockOffset = payload.serverNow - Date.now();

  game = new Game({
    canvas: gameCanvas,
    localId: socket.id,
    car: me.car,
    players: payload.players,
    laps: payload.laps,
    startAt: payload.startAt - clockOffset,
    audio,
    onHud: renderHud,
    onState: (state: PeerState) => socket.emit('race:state', state),
    onFinished: (time: number) => {
      socket.emit('race:finish', { time });
      toast('¡Meta! Esperando a los demás pilotos…');
    },
  });
  lastCountdown = '';
}

function renderResults(payload: ResultsPayload): void {
  teardownGame();
  audio.stopEngine();
  resultsList.innerHTML = '';
  for (const result of payload.results) {
    const row = document.createElement('li');
    row.className = 'result-row';
    if (result.id === socket.id) row.classList.add('is-me');

    const place = document.createElement('span');
    place.className = 'place';
    place.textContent = result.place === 1 ? '🏆' : String(result.place);

    const chip = document.createElement('span');
    chip.className = 'car-chip';
    chip.style.background = result.car.color;
    chip.style.boxShadow = `0 0 12px ${result.car.color}`;

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = result.name + (result.id === socket.id ? ' (tú)' : '');

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = result.time == null ? 'Sin terminar' : formatTime(result.time);

    row.append(place, chip, name, time);
    resultsList.appendChild(row);
  }

  btnAgain.classList.toggle('hidden', !isHost());
  btnAgain.disabled = false;
}

function leaveRoom(): void {
  socket.emit('room:leave');
  resetToMenu();
}

// ---------------------------------------------------------------------------
// Acciones de UI
// ---------------------------------------------------------------------------
async function createRoom(): Promise<void> {
  if (pendingRequest) return;
  pendingRequest = true;
  setMenuError(null);
  btnCreate.disabled = true;
  try {
    const response = await request<{ ok: boolean; error?: string; room?: RoomView }>('room:create', {
      name: getName(),
      car: myCar,
    });
    if (!response.ok || !response.room) throw new Error(response.error ?? 'No se pudo crear la sala');
    enterRoom(response.room);
  } catch (error) {
    setMenuError((error as Error).message);
  } finally {
    pendingRequest = false;
    btnCreate.disabled = false;
  }
}

async function joinRoom(): Promise<void> {
  if (pendingRequest) return;
  const code = inputCode.value.trim().toUpperCase();
  if (code.length !== 5) {
    setMenuError('Escribe un código de 5 caracteres.');
    return;
  }
  pendingRequest = true;
  setMenuError(null);
  btnJoin.disabled = true;
  try {
    const response = await request<{ ok: boolean; error?: string; room?: RoomView }>('room:join', {
      code,
      name: getName(),
      car: myCar,
    });
    if (!response.ok || !response.room) throw new Error(response.error ?? 'No se pudo entrar a la sala');
    enterRoom(response.room);
  } catch (error) {
    setMenuError((error as Error).message);
  } finally {
    pendingRequest = false;
    btnJoin.disabled = false;
  }
}

async function copyInvite(): Promise<void> {
  if (!room) return;
  const url = `${location.origin}${location.pathname}?sala=${room.code}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('Invitación copiada. ¡Pásasela a tus amigos!');
  } catch {
    window.prompt('Copia este enlace de invitación:', url);
  }
}

// ---------------------------------------------------------------------------
// Eventos del servidor
// ---------------------------------------------------------------------------
socket.on('room:update', (view: RoomView) => applyRoom(view));

socket.on('race:start', (payload: RaceStartPayload) => startRace(payload));

socket.on('race:peer', (message: { id: string; state: PeerState }) => {
  game?.setPeerState(message.id, message.state);
});

socket.on('race:results', (payload: ResultsPayload) => {
  renderResults(payload);
  hide(hud);
  hideScreens();
  show(screenResults);
  toast('Carrera terminada');
});

socket.on('disconnect', () => {
  connectionWarned = false;
  if (!room) return;
  resetToMenu('Conexión perdida con el servidor.');
});

socket.on('connect_error', () => {
  if (connectionWarned) return;
  connectionWarned = true;
  toast('No se pudo conectar con el servidor. Comprueba que esté iniciado.');
});

// ---------------------------------------------------------------------------
// Eventos de UI
// ---------------------------------------------------------------------------
btnCreate.addEventListener('click', () => void createRoom());
btnJoin.addEventListener('click', () => void joinRoom());
btnGarageMenu.addEventListener('click', () => openGarage());
btnGarageLobby.addEventListener('click', () => openGarage());
btnGarageClose.addEventListener('click', closeGarage);
btnGarageSave.addEventListener('click', saveGarage);

btnReady.addEventListener('click', () => {
  if (!room) return;
  const me = room.players.find((player) => player.id === socket.id);
  socket.emit('player:ready', { ready: !me?.ready });
});

btnStart.addEventListener('click', () => {
  if (!isHost()) return;
  btnStart.disabled = true;
  socket.emit('room:start', {}, (response: { ok: boolean; error?: string }) => {
    if (response?.ok) return;
    btnStart.disabled = false;
    toast(response?.error ?? 'No se pudo iniciar la carrera.');
  });
});

btnCopy.addEventListener('click', () => void copyInvite());
btnLeaveLobby.addEventListener('click', leaveRoom);
btnResultsLeave.addEventListener('click', leaveRoom);
btnAgain.addEventListener('click', () => {
  btnAgain.disabled = true;
  socket.emit('race:again');
});

btnQuitRace.addEventListener('click', () => {
  if (!window.confirm('¿Seguro que quieres salir de la carrera?')) return;
  leaveRoom();
});

btnMusic.addEventListener('click', () => {
  audio.setMusicEnabled(!audio.audioSettings.music);
  refreshAudioUi();
});

btnSound.addEventListener('click', () => {
  audio.setEngineEnabled(!audio.audioSettings.engine);
  refreshAudioUi();
});

btnAudioHud.addEventListener('click', () => {
  const settings = audio.audioSettings;
  const next = !(settings.music || settings.engine);
  audio.setMusicEnabled(next);
  audio.setEngineEnabled(next);
  refreshAudioUi();
});

musicVolume.addEventListener('input', () => {
  audio.setMusicVolume(Number(musicVolume.value) / 100);
  refreshAudioUi();
});

engineVolume.addEventListener('input', () => {
  audio.setEngineVolume(Number(engineVolume.value) / 100);
  refreshAudioUi();
});

inputMusicFile.addEventListener('change', () => {
  const file = inputMusicFile.files?.[0];
  if (!file) return;
  audio.useCustomTrack(file);
  refreshAudioUi();
  toast(`Música: ${audio.sourceLabel}`);
  inputMusicFile.value = '';
});

inputName.addEventListener('input', () => {
  myName = inputName.value.slice(0, 16);
  localStorage.setItem(NAME_KEY, myName);
});

inputName.addEventListener('blur', () => {
  const name = sanitizeName(inputName.value);
  inputName.value = name;
  myName = name;
  localStorage.setItem(NAME_KEY, name);
});

inputCode.addEventListener('input', () => {
  inputCode.value = inputCode.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5);
});

inputCode.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') void joinRoom();
});

window.addEventListener('beforeunload', () => {
  game?.dispose();
});

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
buildGarageUi();
refreshAudioUi();

document.addEventListener('pointerdown', () => audio.unlock());
document.addEventListener('keydown', () => audio.unlock());

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__neon = {
    socket,
    get game() {
      return game;
    },
    get room() {
      return room;
    },
  };
}

inputName.value = myName;

const params = new URLSearchParams(location.search);
const inviteCode = (params.get('sala') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
if (inviteCode) {
  inputCode.value = inviteCode;
  inputName.focus();
}

refreshGarage();
showMenu();
