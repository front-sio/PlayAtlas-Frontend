import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { normalizeSocketTarget } from '../lib/socket';

interface UseSocketOptions {
  enabled?: boolean;
}

export function useSocket(options: UseSocketOptions = {}) {
  const { enabled = true } = options;
  const { data: session, status } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!enabled || status !== 'authenticated' || !session) {
      return;
    }

    const token = (session as any).accessToken;
    const WS_URL = process.env.NEXT_PUBLIC_ADMIN_WS_URL || 'ws://localhost:8080';
    const { url, path } = normalizeSocketTarget(WS_URL);

    const socketInstance = io(url, {
      path,
      auth: {
        token: token
      },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setIsConnected(false);
    });

    socketInstance.on('error', (error) => {
      console.error('Socket error:', error);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
      setSocket(null);
      setIsConnected(false);
    };
  }, [enabled, status, session]);

  const emit = useCallback((event: string, data: any) => {
    if (socket && isConnected) {
      socket.emit(event, data);
    }
  }, [socket, isConnected]);

  return {
    socket,
    isConnected,
    emit
  };
}
