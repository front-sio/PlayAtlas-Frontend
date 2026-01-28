import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { normalizeSocketTarget } from '../lib/socket';

interface UseSocketOptions {
  enabled?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

export function useSocket(options: UseSocketOptions = {}) {
  const { enabled = true, maxReconnectAttempts = 10, reconnectDelay = 2000 } = options;
  const { data: session, status } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const socketTarget = normalizeSocketTarget(process.env.NEXT_PUBLIC_ADMIN_WS_URL || '');

  useEffect(() => {
    if (!enabled || status !== 'authenticated' || !session) {
      return;
    }

    const token = (session as any).accessToken;
    const connectionUrl = socketTarget.url || undefined;

    const socketInstance = io(connectionUrl, {
      path: socketTarget.path,
      auth: {
        token: token
      },
      transports: ['polling'],
      reconnection: true,
      reconnectionDelay: reconnectDelay,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: maxReconnectAttempts,
      timeout: 20000,
      upgrade: false,
      rememberUpgrade: false,
      autoConnect: true,
      forceNew: false
    });

    let reconnectTimeout: NodeJS.Timeout;

    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
      setIsConnected(true);
      setReconnectAttempts(0);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
      
      // Only attempt manual reconnection for specific reasons
      if (reason === 'io server disconnect' || reason === 'transport close') {
        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectTimeout = setTimeout(() => {
            console.log(`Manual reconnect attempt ${reconnectAttempts + 1}/${maxReconnectAttempts}`);
            setReconnectAttempts(prev => prev + 1);
            socketInstance.connect();
          }, reconnectDelay * (reconnectAttempts + 1));
        }
      }
    });

    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setIsConnected(false);
    });

    socketInstance.on('error', (error) => {
      console.error('Socket error:', error);
    });

    socketInstance.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
      setIsConnected(true);
      setReconnectAttempts(0);
    });

    socketInstance.on('reconnect_error', (error) => {
      console.error('Socket reconnect error:', error);
    });

    socketInstance.on('reconnect_failed', () => {
      console.error('Socket failed to reconnect after all attempts');
      setIsConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      socketInstance.disconnect();
      setSocket(null);
      setIsConnected(false);
      setReconnectAttempts(0);
    };
  }, [enabled, status, session, maxReconnectAttempts, reconnectDelay, socketTarget.url, socketTarget.path]);

  const emit = useCallback((event: string, data: any) => {
    if (socket && isConnected) {
      socket.emit(event, data);
    } else {
      console.warn(`Cannot emit ${event}: socket not connected`);
    }
  }, [socket, isConnected]);

  const forceReconnect = useCallback(() => {
    if (socket) {
      console.log('Forcing socket reconnection');
      socket.disconnect();
      socket.connect();
    }
  }, [socket]);

  return {
    socket,
    isConnected,
    emit,
    forceReconnect,
    reconnectAttempts
  };
}
