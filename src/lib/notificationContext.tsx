import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { io, Socket } from 'socket.io-client';
import { normalizeSocketTarget } from './socket';
import { notificationService, Notification } from './notificationService';

interface RealtimeNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  data: any;
  timestamp: string;
  read: boolean;
}

interface NotificationContextType {
  notifications: RealtimeNotification[];
  unreadCount: number;
  connected: boolean;
  addNotification: (notification: RealtimeNotification) => void;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  socket: Socket | null;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

interface NotificationProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const { data: session } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);

  const userId = (session?.user as any)?.id || (session?.user as any)?.userId;

  useEffect(() => {
    if (!userId) return;

    // Connect to Socket.IO
    const socketUrl = process.env.NEXT_PUBLIC_ADMIN_WS_URL || '';
    const { url, path } = normalizeSocketTarget(socketUrl);
    
    const connectionUrl = url || undefined;
    const newSocket = io(connectionUrl, {
      path,
      transports: ['polling'],
      upgrade: false,
      auth: {
        token: (session as any)?.accessToken
      }
    });

    newSocket.on('connect', () => {
      console.log('[Notifications] Socket connected');
      setConnected(true);
      
      // Join user-specific room
      newSocket.emit('join:user', userId);
    });

    newSocket.on('disconnect', () => {
      console.log('[Notifications] Socket disconnected');
      setConnected(false);
    });

    // Handle new notifications
    newSocket.on('notification:new', (notification: RealtimeNotification) => {
      console.log('[Notifications] New notification received:', notification);
      setNotifications(prev => [notification, ...prev]);
      
      // Show browser notification if permission granted
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/icon-192x192.png',
          tag: notification.id
        });
      }
    });

    // Handle broadcast notifications
    newSocket.on('notification:broadcast', (notification: RealtimeNotification) => {
      console.log('[Notifications] Broadcast notification received:', notification);
      setNotifications(prev => [notification, ...prev]);
      
      // Show browser notification if permission granted
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/icon-192x192.png',
          tag: notification.id
        });
      }
    });

    // Handle match ready notifications
    newSocket.on('match:ready', (matchData: any) => {
      console.log('[Notifications] Match ready notification:', matchData);
      const notification: RealtimeNotification = {
        id: `match_${matchData.matchId}_${Date.now()}`,
        type: 'match_ready',
        title: 'Your Match is Ready!',
        message: `Your tournament match is ready to play. Click to join!`,
        data: matchData,
        timestamp: new Date().toISOString(),
        read: false
      };
      setNotifications(prev => [notification, ...prev]);
      
      // Show browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/icon-192x192.png',
          tag: notification.id
        });
      }
    });

    // Handle season created notifications  
    newSocket.on('tournament:season_created', (seasonData: any) => {
      console.log('[Notifications] Season created notification:', seasonData);
      const notification: RealtimeNotification = {
        id: `season_${seasonData.seasonId}_${Date.now()}`,
        type: 'new_season',
        title: 'New Tournament Season!',
        message: `${seasonData.name} is now open for registration!`,
        data: seasonData,
        timestamp: new Date().toISOString(),
        read: false
      };
      setNotifications(prev => [notification, ...prev]);
      
      // Show browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/icon-192x192.png',
          tag: notification.id
        });
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [userId, session]);

  // Request browser notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('[Notifications] Browser permission:', permission);
      });
    }
  }, []);

  // Load initial notifications from API
  useEffect(() => {
    if (!userId) return;

    const loadInitialNotifications = async () => {
      try {
        const response = await notificationService.getUserNotifications({ 
          limit: 20,
          isRead: false 
        });
        
        if (response.success && response.data) {
          const realtimeNotifications = response.data.map((notif: Notification) => ({
            id: notif.notificationId,
            type: notif.type,
            title: notif.title,
            message: notif.message,
            data: notif.data,
            timestamp: notif.createdAt,
            read: notif.isRead
          }));
          
          setNotifications(realtimeNotifications);
        }
      } catch (error) {
        console.error('[Notifications] Failed to load initial notifications:', error);
      }
    };

    loadInitialNotifications();
  }, [userId]);

  const addNotification = (notification: RealtimeNotification) => {
    setNotifications(prev => [notification, ...prev]);
  };

  const markAsRead = (notificationId: string) => {
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === notificationId 
          ? { ...notif, read: true }
          : notif
      )
    );
    
    // Also mark as read on server
    notificationService.markAsRead(notificationId).catch(err => {
      console.error('[Notifications] Failed to mark as read on server:', err);
    });
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
    
    // Mark all as read on server
    notifications.forEach(notif => {
      if (!notif.read) {
        notificationService.markAsRead(notif.id).catch(err => {
          console.error('[Notifications] Failed to mark as read on server:', err);
        });
      }
    });
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const unreadCount = notifications.filter(notif => !notif.read).length;

  const value = {
    notifications,
    unreadCount,
    connected,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    socket
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

export type { RealtimeNotification };
