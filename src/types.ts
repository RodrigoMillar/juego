export type BodyStyle = 0 | 1 | 2;
export type HairStyle = 0 | 1 | 2 | 3;

export interface CharacterConfig {
  name: string;
  skin: string;
  hair: string;
  eyes: string;
  hairStyle: HairStyle;
}

export const DEFAULT_CHARACTER: CharacterConfig = {
  name: 'Piloto',
  skin: '#f1c27d',
  hair: '#3b2f2f',
  eyes: '#2b6cb0',
  hairStyle: 1,
};
export type CarModelId =
  | 'lada'
  | 'fiat'
  | 'chevette'
  | 'luv'
  | 'cavalier'
  | 'beetle'
  | 'falcon'
  | 'ritmo'
  | 'd21'
  | 'v16';
export type CarFinish = 'gloss' | 'matte' | 'metal';

export interface CarModel {
  id: CarModelId;
  name: string;
  year: string;
}

export const CAR_MODELS: ReadonlyArray<CarModel> = [
  { id: 'lada', name: 'Lada 2106', year: '1976' },
  { id: 'fiat', name: 'Fiat 132', year: '1977' },
  { id: 'chevette', name: 'Chevrolet Chevette', year: '1976' },
  { id: 'luv', name: 'Chevrolet LUV', year: '1999' },
  { id: 'cavalier', name: 'Chevrolet Cavalier', year: '1996' },
  { id: 'beetle', name: 'Volkswagen Escarabajo', year: '1974' },
  { id: 'falcon', name: 'Chevrolet Falcon', year: '1970' },
  { id: 'ritmo', name: 'Fiat Ritmo', year: '1978' },
  { id: 'd21', name: 'Nissan D21', year: '1997' },
  { id: 'v16', name: 'Nissan V16', year: '1995' },
];

export const CAR_FINISHES: ReadonlyArray<{ id: CarFinish; label: string }> = [
  { id: 'gloss', label: 'Brillante' },
  { id: 'matte', label: 'Mate' },
  { id: 'metal', label: 'Metalizado' },
];

export function isCarModel(value: unknown): value is CarModelId {
  return CAR_MODELS.some((model) => model.id === value);
}

export function isHairStyle(value: unknown): value is HairStyle {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function normalizeCharacter(input: unknown): CharacterConfig {
  const src = input && typeof input === 'object' ? (input as Partial<CharacterConfig>) : {};
  return {
    name: sanitizeName(src.name ?? DEFAULT_CHARACTER.name),
    skin: typeof src.skin === 'string' && HEX_RE.test(src.skin) ? src.skin : DEFAULT_CHARACTER.skin,
    hair: typeof src.hair === 'string' && HEX_RE.test(src.hair) ? src.hair : DEFAULT_CHARACTER.hair,
    eyes: typeof src.eyes === 'string' && HEX_RE.test(src.eyes) ? src.eyes : DEFAULT_CHARACTER.eyes,
    hairStyle: isHairStyle(src.hairStyle) ? src.hairStyle : DEFAULT_CHARACTER.hairStyle,
  };
}

export function isCarFinish(value: unknown): value is CarFinish {
  return CAR_FINISHES.some((finish) => finish.id === value);
}

export function carModelName(id: CarModelId): string {
  return CAR_MODELS.find((model) => model.id === id)?.name ?? CAR_MODELS[0].name;
}

export function carModelYear(id: CarModelId): string {
  return CAR_MODELS.find((model) => model.id === id)?.year ?? CAR_MODELS[0].year;
}

export interface CarConfig {
  model: CarModelId;
  color: string;
  accent: string;
  style: BodyStyle;
  finish: CarFinish;
  character?: CharacterConfig;
  /** 0..5 */
  speed: number;
  /** 0..5 */
  accel: number;
  /** 0..5 */
  grip: number;
}

export interface PlayerInfo {
  id: string;
  name: string;
  car: CarConfig;
  ready: boolean;
  finished?: boolean;
  time?: number | null;
}

export type RoomState = 'lobby' | 'racing' | 'results';

export interface RoomView {
  code: string;
  hostId: string;
  state: RoomState;
  laps: number;
  players: PlayerInfo[];
}

export interface PeerState {
  x: number;
  z: number;
  heading: number;
  speed: number;
  progress: number;
  lap: number;
  finished: boolean;
}

export interface RaceStartPayload {
  startAt: number;
  serverNow: number;
  trackSeed: number;
  laps: number;
  players: PlayerInfo[];
}

export interface RaceResult {
  place: number;
  id: string;
  name: string;
  time: number | null;
  car: CarConfig;
}

export interface ResultsPayload {
  results: RaceResult[];
  laps: number;
}

export interface HudState {
  speed: number;
  lap: number;
  totalLaps: number;
  position: number;
  players: number;
  time: number;
  countdown: string | null;
  offroad: boolean;
  finished: boolean;
}

export const DEFAULT_CAR: CarConfig = {
  model: 'lada',
  color: '#22d3ee',
  accent: '#ff3ea5',
  style: 1,
  finish: 'gloss',
  character: { ...DEFAULT_CHARACTER },
  speed: 3,
  accel: 3,
  grip: 2,
};

export const POINT_BUDGET = 8;
export const MAX_STAT = 5;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function clampInt(value: unknown, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function normalizeCar(input: Partial<CarConfig> | null | undefined): CarConfig {
  const src = input && typeof input === 'object' ? input : {};
  const car: CarConfig = {
    model: isCarModel(src.model) ? src.model : DEFAULT_CAR.model,
    color: typeof src.color === 'string' && HEX_RE.test(src.color) ? src.color : DEFAULT_CAR.color,
    accent: typeof src.accent === 'string' && HEX_RE.test(src.accent) ? src.accent : DEFAULT_CAR.accent,
    style: clampInt(src.style, 0, 2) as BodyStyle,
    finish: isCarFinish(src.finish) ? src.finish : DEFAULT_CAR.finish,
    character: normalizeCharacter(src.character),
    speed: clampInt(src.speed, 0, MAX_STAT),
    accel: clampInt(src.accel, 0, MAX_STAT),
    grip: clampInt(src.grip, 0, MAX_STAT),
  };

  // Enforce the point budget by trimming the least useful stats first.
  const order: Array<keyof Pick<CarConfig, 'grip' | 'accel' | 'speed'>> = ['grip', 'accel', 'speed'];
  let total = car.speed + car.accel + car.grip;
  while (total > POINT_BUDGET) {
    const key = order.find((k) => car[k] > 0);
    if (!key) break;
    car[key] -= 1;
    total -= 1;
  }
  return car;
}

export function sanitizeName(raw: unknown): string {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 16);
  return name || 'Piloto';
}