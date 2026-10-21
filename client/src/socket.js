import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_API_URL || window.location.origin;
const isVercelServerless = typeof URL === 'string' && URL.includes('vercel.app');

export const socket = io(URL, {
  autoConnect: !isVercelServerless,
  reconnection: !isVercelServerless,
  reconnectionAttempts: isVercelServerless ? 0 : 5,
  reconnectionDelay: 5000,
  transports: ['websocket', 'polling'],
});

