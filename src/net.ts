import { io } from 'socket.io-client';

// En Netlify solo se aloja el frontend. Para las salas hace falta un backend
// Node aparte (Render, Railway, Fly.io, etc.). Configura su URL en Netlify con
// la variable VITE_SERVER_URL, por ejemplo:
//   VITE_SERVER_URL=https://puente-alto-racing.onrender.com
const serverUrl = (import.meta.env.VITE_SERVER_URL as string | undefined)?.trim().replace(/\/+$/, '');

export const socket = io(serverUrl || undefined, {
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
