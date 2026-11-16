import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_API_URL || window.location.origin;

// Hostinger (zivoxtech.com) and Vercel serverless proxies do not forward WebSocket handshakes (/socket.io/)
// Disabling autoConnect on these hosts completely eliminates the browser console "Unexpected response code: 200" error.
const isUnsupportedHost = 
  (typeof URL === 'string' && (URL.includes('vercel.app') || URL.includes('zivoxtech.com'))) ||
  (typeof window !== 'undefined' && window.location.hostname.includes('zivoxtech.com'));

const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const shouldConnect = isLocalhost || import.meta.env.VITE_ENABLE_SOCKET === 'true';

export const socket = io(URL, {
  autoConnect: shouldConnect,
  reconnection: shouldConnect,
  reconnectionAttempts: 0,
  transports: ['websocket', 'polling'],
  withCredentials: true,
  upgrade: true,
  timeout: 5000,
});

// Suppress unhandled handshake warning and prevent noisy console logs
socket.on('connect_error', () => {
  if (socket.io) {
    socket.io.opts.reconnection = false;
  }
});

