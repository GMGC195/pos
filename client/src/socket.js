import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_API_URL || window.location.origin;
const isVercelServerless = typeof URL === 'string' && URL.includes('vercel.app');

export const socket = io(URL, {
  autoConnect: !isVercelServerless,
  reconnection: !isVercelServerless,
  reconnectionAttempts: 1,
  reconnectionDelay: 10000,
  transports: ['websocket', 'polling'],
  withCredentials: true,
  upgrade: true,
  timeout: 8000,
});

// Suppress unhandled handshake warning and stop reconnect loops if Nginx proxy is not yet configured
socket.on('connect_error', () => {
  if (socket.io) {
    socket.io.opts.reconnection = false;
  }
});

