'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Bell, Check, Trophy, DollarSign, Calendar, Megaphone, ClipboardCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { notificationService, Notification } from '@/lib/notificationService';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/hooks/useSocket';

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'tournament':
      return Trophy;
    case 'match':
      return Calendar;
    case 'payment':
      return DollarSign;
    case 'marketing':
      return Megaphone;
    case 'approval':
      return ClipboardCheck;
    default:
      return Bell;
  }
};

const getNotificationColor = (type: string) => {
  switch (type) {
    case 'tournament':
      return 'text-yellow-400 bg-yellow-400/10';
    case 'match':
      return 'text-blue-400 bg-blue-400/10';
    case 'payment':
      return 'text-green-400 bg-green-400/10';
    case 'marketing':
      return 'text-purple-400 bg-purple-400/10';
    case 'approval':
      return 'text-orange-400 bg-orange-400/10';
    default:
      return 'text-gray-400 bg-gray-400/10';
  }
};

interface NotificationBellProps {
  className?: string;
  theme?: 'dark' | 'light';
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ className, theme = 'dark' }) => {
  const { data: session } = useSession();
  const router = useRouter();
  const { socket } = useSocket({ enabled: true });
  const userId = (session?.user as any)?.id || (session?.user as any)?.userId;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastNotificationIdsRef = useRef<Set<string>>(new Set());

  // Sound notification function
  const playNotificationSound = () => {
    try {
      // Create audio context for notification sound
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create a notification tone (simple beep)
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Set frequency for notification sound (800Hz)
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.type = 'sine';
      
      // Set volume
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.3);
      
      // Play sound for 300ms
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.warn('Could not play notification sound:', error);
    }
  };

  const shouldPlaySound = (notification: Notification) => {
    if (!notification?.data?.playSound) return false;
    return notification.type === 'payment' || notification.type === 'approval';
  };

  const fetchNotifications = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      const response = await notificationService.getUserNotifications({ isRead: false, limit: 10 });
      const mergedNotifications = (response.success ? response.data : []).sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      const previousIds = lastNotificationIdsRef.current;
      const nextIds = new Set(mergedNotifications.map((notification) => notification.notificationId));
      const hasSound = mergedNotifications.some(
        (notification) =>
          !previousIds.has(notification.notificationId) && shouldPlaySound(notification)
      );

      if (hasSound) {
        playNotificationSound();
      }

      lastNotificationIdsRef.current = nextIds;
      setNotifications(mergedNotifications);
      setUnreadCount(mergedNotifications.length);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationService.markAsRead(notificationId);
      setNotifications(prev => prev.filter(n => n.notificationId !== notificationId));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await Promise.all(
        notifications.map(n => notificationService.markAsRead(n.notificationId))
      );
      setNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [session?.user]);

  useEffect(() => {
    if (!socket) return;

    const handleNotification = (notification: Notification) => {
      if (!notification || notification.isRead) return;

      setNotifications((prev) => {
        if (prev.some((item) => item.notificationId === notification.notificationId)) {
          return prev;
        }
        return [notification, ...prev].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });

      setUnreadCount((prev) => prev + 1);

      if (shouldPlaySound(notification)) {
        playNotificationSound();
      }
    };

    socket.on('notification:new', handleNotification);
    return () => {
      socket.off('notification:new', handleNotification);
    };
  }, [socket]);

  // Theme-aware colors
  const bellColor = theme === 'dark' 
    ? (unreadCount > 0 ? 'text-white' : 'text-white/60')
    : (unreadCount > 0 ? 'text-slate-900' : 'text-slate-600');
  
  const hoverBg = theme === 'dark' ? 'hover:bg-white/10' : 'hover:bg-slate-100';
  const dropdownBg = theme === 'dark' ? 'bg-gray-900 border-white/10' : 'bg-white border-slate-200';
  const headerBorder = theme === 'dark' ? 'border-white/10' : 'border-slate-200';
  const titleColor = theme === 'dark' ? 'text-white' : 'text-slate-900';
  const divider = theme === 'dark' ? 'divide-white/10' : 'divide-slate-100';
  const loadingColor = theme === 'dark' ? 'text-white/60' : 'text-slate-500';
  const emptyIconColor = theme === 'dark' ? 'text-white/20' : 'text-slate-300';
  const emptyTextColor = theme === 'dark' ? 'text-white/60' : 'text-slate-500';
  const markAllColor = theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700';
  const itemHover = theme === 'dark' ? 'hover:bg-white/5' : 'hover:bg-slate-50';
  const checkIconColor = theme === 'dark' ? 'text-white/40 hover:text-white' : 'text-slate-400 hover:text-slate-600';
  const messageColor = theme === 'dark' ? 'text-white/70' : 'text-slate-600';
  const dateColor = theme === 'dark' ? 'text-white/50' : 'text-slate-400';

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative p-2 rounded-lg ${hoverBg} transition-colors`}
      >
        <Bell className={`w-5 h-5 ${bellColor}`} />
        {unreadCount > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-white text-xs">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className={`absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-lg ${dropdownBg} shadow-xl z-50`}>
            <div className={`p-4 border-b ${headerBorder}`}>
              <div className="flex items-center justify-between">
                <h3 className={`text-sm font-semibold ${titleColor}`}>Notifications</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className={`text-xs ${markAllColor} transition-colors`}
                  >
                    Mark all as read
                  </button>
                )}
              </div>
            </div>

            <div className={`divide-y ${divider}`}>
              {loading ? (
                <div className={`p-4 text-center ${loadingColor} text-sm`}>
                  Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className={`w-12 h-12 mx-auto mb-3 ${emptyIconColor}`} />
                  <p className={`${emptyTextColor} text-sm`}>No unread notifications</p>
                </div>
              ) : (
                notifications.map((notification) => {
                  const Icon = getNotificationIcon(notification.type);
                  const colorClass = getNotificationColor(notification.type);

                  return (
                    <div
                      key={notification.notificationId}
                      className={`p-3 ${itemHover} transition-colors cursor-pointer`}
                      onClick={() => {
                        if (notification.data?.actionUrl) {
                          router.push(notification.data.actionUrl);
                        }
                        handleMarkAsRead(notification.notificationId);
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex-shrink-0 p-2 rounded-lg ${colorClass}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm font-medium ${titleColor}`}>
                              {notification.title}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkAsRead(notification.notificationId);
                              }}
                              className={`flex-shrink-0 ${checkIconColor} transition-colors`}
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                          <p className={`text-xs ${messageColor} mt-1 line-clamp-2`}>
                            {notification.message}
                          </p>
                          <p className={`text-xs ${dateColor} mt-1`}>
                            {new Date(notification.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
