import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_API_URL || window.location.origin;
const isVercelServerless = typeof URL === 'string' && URL.includes('vercel.app');

export const socket = io(URL, {
  autoConnect: !isVercelServerless,
  reconnection: !isVercelServerless,
  reconnectionAttempts: 3,
  reconnectionDelay: 10000,
  transports: ['websocket', 'polling'],
  withCredentials: true,
  upgrade: true,
  timeout: 10000,
});

// Suppress unhandled handshake warning and prevent breaking UI if backend/proxy does not support websocket
socket.on('connect_error', () => {
  // Silent fallback - React Query background refetching (5 min) keeps data fresh even if socket is disconnected
});

