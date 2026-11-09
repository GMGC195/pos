import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_API_URL || window.location.origin;
const isVercelServerless = typeof URL === 'string' && URL.includes('vercel.app');

export const socket = io(URL, {
  autoConnect: !isVercelServerless,
  reconnection: !isVercelServerless,
  reconnectionAttempts: isVercelServerless ? 0 : 5,
  reconnectionDelay: 5000,
  transports: ['polling', 'websocket'],
  withCredentials: true,
  upgrade: true,
});

// Suppress unhandled handshake warning if proxy doesn't support immediate websocket upgrade
socket.on('connect_error', (err) => {
  // Silent fallback - connection will seamlessly proceed via polling
  if (socket.io && socket.io.opts) {
    socket.io.opts.transports = ['polling', 'websocket'];
  }
});

