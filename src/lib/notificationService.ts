import { getSession } from 'next-auth/react';
import { getApiBaseUrl } from '@/lib/apiBase';

const NOTIFICATION_SERVICE_URL = `${getApiBaseUrl()}/notification`;

export interface Notification {
  notificationId: string;
  userId: string;
  type: 'tournament' | 'match' | 'payment' | 'marketing' | 'approval';
  title: string;
  message: string;
  data: any;
  channel: 'email' | 'sms' | 'push' | 'in_app';
  priority: 'low' | 'normal' | 'high';
  status: 'pending' | 'sent' | 'failed';
  isRead: boolean;
  createdAt: string;
  sentAt?: string;
  readAt?: string;
  errorMessage?: string;
}

export interface NotificationPreferences {
  userId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  tournamentUpdates: boolean;
  matchReminders: boolean;
  paymentAlerts: boolean;
  marketingEmails: boolean;
}

class NotificationService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = NOTIFICATION_SERVICE_URL;
  }

  private async getSessionContext() {
    const session = await getSession();
    const token = (session as any)?.accessToken as string | undefined;
    const userId = (session?.user as any)?.id || (session?.user as any)?.userId;
    return { session, token, userId };
  }

  private buildAuthHeaders(token?: string) {
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    };
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}) {
    const { token } = await this.getSessionContext();
    if (!token) {
      return { response: null, tokenMissing: true };
    }

    let response = await fetch(url, {
      ...options,
      headers: this.buildAuthHeaders(token)
    });

    if (response.status === 401) {
      const refreshed = await this.getSessionContext();
      const refreshedToken = refreshed.token;
      if (refreshedToken && refreshedToken !== token) {
        response = await fetch(url, {
          ...options,
          headers: this.buildAuthHeaders(refreshedToken)
        });
      }
    }

    return { response, tokenMissing: false };
  }

  // Get user notifications
  async getUserNotifications(params?: {
    isRead?: boolean;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ success: boolean; data: Notification[] }> {
    const { userId } = await this.getSessionContext();

    if (!userId) {
      console.warn('User not authenticated, returning empty notifications');
      return { success: true, data: [] };
    }

    try {
      const queryParams = new URLSearchParams();
      if (params?.isRead !== undefined) {
        queryParams.append('isRead', params.isRead.toString());
      }
      if (params?.type) {
        queryParams.append('type', params.type);
      }
      queryParams.append('limit', (params?.limit || 50).toString());
      queryParams.append('offset', (params?.offset || 0).toString());

      const { response, tokenMissing } = await this.fetchWithAuth(
        `${this.baseUrl}/user/${userId}?${queryParams.toString()}`,
        {
          method: 'GET'
        }
      );

      if (tokenMissing || !response) {
        return { success: true, data: [] };
      }

      return response.json();
    } catch (error) {
      console.error('Network error fetching notifications:', error);
      return { success: true, data: [] };
    }
  }

  // Mark notification as read
  async markAsRead(notificationId: string): Promise<{ success: boolean; message: string }> {
    try {
      const { response, tokenMissing } = await this.fetchWithAuth(
        `${this.baseUrl}/${notificationId}/read`,
        { method: 'PUT' }
      );

      if (tokenMissing || !response) {
        return { success: false, message: 'Not authenticated' };
      }

      return response.json();
    } catch (error) {
      console.error('Network error marking notification as read:', error);
      return { success: false, message: 'Failed to mark as read' };
    }
  }

  // Get notification preferences
  async getPreferences(): Promise<{ success: boolean; data: NotificationPreferences }> {
    const { userId } = await this.getSessionContext();

    if (!userId) {
      console.warn('User not authenticated, returning default preferences');
      return {
        success: true,
        data: {
          userId: 'unknown',
          emailEnabled: true,
          smsEnabled: true,
          pushEnabled: true,
          tournamentUpdates: true,
          matchReminders: true,
          paymentAlerts: true,
          marketingEmails: false
        }
      };
    }

    try {
      const { response, tokenMissing } = await this.fetchWithAuth(
        `${this.baseUrl}/preferences/${userId}`,
        {
          method: 'GET'
        }
      );

      if (tokenMissing || !response) {
        return {
          success: true,
          data: {
            userId: 'unknown',
            emailEnabled: true,
            smsEnabled: true,
            pushEnabled: true,
            tournamentUpdates: true,
            matchReminders: true,
            paymentAlerts: true,
            marketingEmails: false
          }
        };
      }

      return response.json();
    } catch (error) {
      console.error('Network error fetching preferences:', error);
      return {
        success: true,
        data: {
          userId: 'unknown',
          emailEnabled: true,
          smsEnabled: true,
          pushEnabled: true,
          tournamentUpdates: true,
          matchReminders: true,
          paymentAlerts: true,
          marketingEmails: false
        }
      };
    }
  }

  // Update notification preferences
  async updatePreferences(preferences: Partial<NotificationPreferences>): Promise<{ success: boolean; data: NotificationPreferences }> {
    const { userId } = await this.getSessionContext();

    if (!userId) {
      console.warn('User not authenticated, cannot update preferences');
      return {
        success: false,
        data: {
          userId: 'unknown',
          emailEnabled: true,
          smsEnabled: true,
          pushEnabled: true,
          tournamentUpdates: true,
          matchReminders: true,
          paymentAlerts: true,
          marketingEmails: false
        }
      };
    }

    try {
      const { response, tokenMissing } = await this.fetchWithAuth(
        `${this.baseUrl}/preferences/${userId}`,
        {
          method: 'PUT',
          body: JSON.stringify(preferences)
        }
      );

      if (tokenMissing || !response) {
        return {
          success: false,
          data: {
            userId: 'unknown',
            emailEnabled: true,
            smsEnabled: true,
            pushEnabled: true,
            tournamentUpdates: true,
            matchReminders: true,
            paymentAlerts: true,
            marketingEmails: false
          }
        };
      }

      return response.json();
    } catch (error) {
      console.error('Network error updating preferences:', error);
      return {
        success: false,
        data: {
          userId: 'unknown',
          emailEnabled: true,
          smsEnabled: true,
          pushEnabled: true,
          tournamentUpdates: true,
          matchReminders: true,
          paymentAlerts: true,
          marketingEmails: false
        }
      };
    }
  }

  // Send notification (for admin use)
  async sendNotification(payload: {
    userId?: string;
    userIds?: string[];
    type: string;
    title: string;
    message: string;
    data?: any;
    channel: 'email' | 'sms' | 'push' | 'in_app';
    priority?: 'low' | 'normal' | 'high';
  }): Promise<{ success: boolean; data: any }> {
    try {
      const isBulk = !payload.userId && payload.userIds && payload.userIds.length > 0;
      const endpoint = isBulk ? '/send-bulk' : '/send';

      const { response, tokenMissing } = await this.fetchWithAuth(
        `${this.baseUrl}${endpoint}`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );

      if (tokenMissing || !response) {
        return { success: false, data: null };
      }

      return response.json();
    } catch (error) {
      console.error('Network error sending notification:', error);
      return { success: false, data: null };
    }
  }
}

export const notificationService = new NotificationService();
