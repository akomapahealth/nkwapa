import { io, Socket } from 'socket.io-client';
import type { GetToken } from './api';
import { getStoredActiveClinicId } from './bootstrap-storage';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

let socket: Socket | null = null;
let currentClinicId: string | null = null;

export function getChatSocket(): Socket | null {
  return socket;
}

export async function connectChatSocket(getToken: GetToken): Promise<Socket> {
  const clinicId = getStoredActiveClinicId();
  if (!clinicId) {
    throw new Error('No active clinic');
  }

  // If already connected to the same clinic, return existing socket
  if (socket?.connected && currentClinicId === clinicId) {
    return socket;
  }

  // Disconnect previous connection if switching clinics
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  const token = await getToken();
  if (!token) {
    throw new Error('No auth token');
  }

  currentClinicId = clinicId;

  socket = io(`${API_BASE}/chat`, {
    auth: { token },
    query: { clinicId },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  // Handle token expiry: reconnect with fresh token
  socket.on('connect_error', async (err) => {
    if (err.message?.includes('Authentication') || err.message?.includes('token')) {
      const freshToken = await getToken();
      if (freshToken && socket) {
        socket.auth = { token: freshToken };
        socket.connect();
      }
    }
  });

  return socket;
}

export function disconnectChatSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentClinicId = null;
  }
}
