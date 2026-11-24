import { io } from 'socket.io-client';

const DEFAULT_SERVER_URL = 'https://juego-n0ch.onrender.com';

const serverUrl =
  (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim().replace(/\/+$/, '') ||
  DEFAULT_SERVER_URL;

export const socket = io(serverUrl, {
  transports: ['websocket', 'polling'],
});

export function request<T>(event: string, payload?: unknown, timeoutMs = 6000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('El servidor no respondió')), timeoutMs);
    socket.emit(event, payload, (response: T) => {
      window.clearTimeout(timer);
      resolve(response);
    });
  });
}