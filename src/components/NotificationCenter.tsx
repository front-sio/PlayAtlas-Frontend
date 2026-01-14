import React, { useState } from 'react';
import { Bell, X, Clock, Trophy, GamepadIcon, Users, Check } from 'lucide-react';
import { useNotifications, RealtimeNotification } from '../lib/notificationContext';
import { useRouter } from 'next/router';

const NotificationIcon: React.FC<{ type: string; className?: string }> = ({ type, className = "w-4 h-4" }) => {
  switch (type) {
    case 'new_season':
    case 'new_season_broadcast':
      return <Trophy className={className} />;
    case 'match_ready':
      return <GamepadIcon className={className} />;
    case 'tournament':
      return <Users className={className} />;
    default:
      return <Bell className={className} />;
  }
};

const NotificationItem: React.FC<{ 
  notification: RealtimeNotification;
  onMarkAsRead: (id: string) => void;
  onAction: (notification: RealtimeNotification) => void;
}> = ({ notification, onMarkAsRead, onAction }) => {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const hasAction = notification.data?.action;

  return (
    <div className={`p-4 border-b border-gray-200 hover:bg-gray-50 transition-colors ${!notification.read ? 'bg-blue-50' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 p-2 rounded-full ${
          notification.read ? 'bg-gray-100' : 'bg-blue-100'
        }`}>
          <NotificationIcon 
            type={notification.type} 
            className={notification.read ? 'text-gray-500' : 'text-blue-600'} 
          />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className={`text-sm font-medium ${notification.read ? 'text-gray-700' : 'text-gray-900'}`}>
              {notification.title}
            </h4>
            {!notification.read && (
              <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
            )}
          </div>
          
          <p className={`text-sm ${notification.read ? 'text-gray-500' : 'text-gray-600'} mb-2`}>
            {notification.message}
          </p>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              <span>{formatTime(notification.timestamp)}</span>
            </div>
            
            <div className="flex items-center gap-2">
              {hasAction && (
                <button
                  onClick={() => onAction(notification)}
                  className="text-xs bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700 transition-colors"
                >
                  {notification.data.action === 'join_season' && 'Join Season'}
                  {notification.data.action === 'join_match' && 'Join Match'}
                  {!notification.data.action.includes('join') && 'View'}
                </button>
              )}
              
              {!notification.read && (
                <button
                  onClick={() => onMarkAsRead(notification.id)}
                  className="text-xs text-gray-500 hover:text-blue-600 transition-colors"
                  title="Mark as read"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const NotificationCenter: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead, connected } = useNotifications();
  const router = useRouter();

  const handleNotificationAction = async (notification: RealtimeNotification) => {
    const { action } = notification.data || {};
    
    if (action === 'join_season' && notification.data.tournamentId) {
      router.push(`/tournaments/${notification.data.tournamentId}?season=${notification.data.seasonId}`);
    } else if (action === 'join_match' && notification.data.matchId) {
      // Redirect to the correct match page path
      router.push(`/game/match/${notification.data.matchId}`);
    }
    
    // Mark as read when action is taken
    if (!notification.read) {
      markAsRead(notification.id);
    }
    
    setIsOpen(false);
  };

  const visibleNotifications = notifications.slice(0, 10); // Show latest 10

  return (
    <div className="relative">
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 transition-colors"
        title="Notifications"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        
        {/* Connection indicator */}
        <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
          connected ? 'bg-green-400' : 'bg-red-400'
        }`} title={connected ? 'Connected' : 'Disconnected'} />
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Notification Panel */}
          <div className="absolute top-full right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Notifications
                  {unreadCount > 0 && (
                    <span className="ml-2 text-sm text-blue-600">
                      ({unreadCount} unread)
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllAsRead()}
                      className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Notifications List */}
            <div className="max-h-80 overflow-y-auto">
              {visibleNotifications.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No notifications yet</p>
                </div>
              ) : (
                visibleNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={markAsRead}
                    onAction={handleNotificationAction}
                  />
                ))
              )}
            </div>

            {/* Footer */}
            {notifications.length > 10 && (
              <div className="p-3 border-t border-gray-200 bg-gray-50 text-center">
                <button 
                  onClick={() => router.push('/notifications')}
                  className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
                >
                  View all notifications
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationCenter;