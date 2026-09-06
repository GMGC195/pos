import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_API_URL || window.location.origin;

export const socket = io(URL, {
  autoConnect: true,
  reconnection: true,
});
