'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { notificationService, NotificationPreferences as NotificationPreferencesType } from '@/lib/notificationService';
import { useSession } from 'next-auth/react';
import { Bell, Mail, Smartphone, RefreshCw, CheckCircle } from 'lucide-react';
import AlertModal from '@/components/ui/AlertModal';

export const NotificationPreferences: React.FC = () => {
  const { data: session } = useSession();
  const [preferences, setPreferences] = useState<NotificationPreferencesType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ open: boolean; title: string; message: string; type: 'success' | 'error' }>({
    open: false,
    title: '',
    message: '',
    type: 'success'
  });

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const response = await notificationService.getPreferences();
      if (response.success) {
        setPreferences(response.data);
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
      showAlert('Error', 'Failed to load notification preferences', 'error');
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async (newPreferences: Partial<NotificationPreferencesType>) => {
    try {
      setSaving(true);
      const response = await notificationService.updatePreferences(newPreferences);
      if (response.success) {
        setPreferences(response.data);
        showAlert('Success', 'Notification preferences updated successfully', 'success');
      }
    } catch (error) {
      console.error('Failed to save preferences:', error);
      showAlert('Error', 'Failed to update notification preferences', 'error');
    } finally {
      setSaving(false);
    }
  };

  const showAlert = (title: string, message: string, type: 'success' | 'error') => {
    setAlert({ open: true, title, message, type });
  };

  useEffect(() => {
    if (session?.user) {
      loadPreferences();
    }
  }, [session?.user]);

  if (loading || !preferences) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center space-x-2 text-white/70">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading preferences...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <Bell className="w-5 h-5 mr-2" />
            Notification Preferences
          </CardTitle>
          <CardDescription className="text-white/60">
            Choose how you want to receive notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Notification Channels */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Notification Channels</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500/20 text-blue-300">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Email Notifications</p>
                    <p className="text-sm text-white/60">Receive updates via email</p>
                  </div>
                </div>
                <Button
                  variant={preferences.emailEnabled ? 'default' : 'secondary'}
                  size="sm"
                  disabled={saving}
                  onClick={() => savePreferences({ emailEnabled: !preferences.emailEnabled })}
                  className={preferences.emailEnabled 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-medium' 
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 font-medium border border-slate-600'}
                  >
                  {preferences.emailEnabled ? 'Enabled' : 'Disabled'}
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-500/20 text-green-300">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-white font-medium">SMS Notifications</p>
                    <p className="text-sm text-white/60">Receive updates via SMS</p>
                  </div>
                </div>
                <Button
                  variant={preferences.smsEnabled ? 'default' : 'secondary'}
                  size="sm"
                  disabled={saving}
                  onClick={() => savePreferences({ smsEnabled: !preferences.smsEnabled })}
                  className={preferences.smsEnabled 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-medium' 
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 font-medium border border-slate-600'}
                >
                  {preferences.smsEnabled ? 'Enabled' : 'Disabled'}
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-500/20 text-purple-300">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Push Notifications</p>
                    <p className="text-sm text-white/60">Receive updates via web push</p>
                  </div>
                </div>
                <Button
                  variant={preferences.pushEnabled ? 'default' : 'secondary'}
                  size="sm"
                  disabled={saving}
                  onClick={() => savePreferences({ pushEnabled: !preferences.pushEnabled })}
                  className={preferences.pushEnabled 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-medium' 
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 font-medium border border-slate-600'}
                >
                  {preferences.pushEnabled ? 'Enabled' : 'Disabled'}
                </Button>
              </div>
            </div>
          </div>

          {/* Notification Types */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Notification Types</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                <div>
                  <p className="text-white font-medium">Tournament Updates</p>
                  <p className="text-sm text-white/60">Get notified about tournament events</p>
                </div>
                <Button
                  variant={preferences.tournamentUpdates ? 'default' : 'secondary'}
                  size="sm"
                  disabled={saving}
                  onClick={() => savePreferences({ tournamentUpdates: !preferences.tournamentUpdates })}
                  className={preferences.tournamentUpdates 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-medium' 
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 font-medium border border-slate-600'}
                >
                  {preferences.tournamentUpdates ? 'Enabled' : 'Disabled'}
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                <div>
                  <p className="text-white font-medium">Match Reminders</p>
                  <p className="text-sm text-white/60">Get notified about upcoming matches</p>
                </div>
                <Button
                  variant={preferences.matchReminders ? 'default' : 'secondary'}
                  size="sm"
                  disabled={saving}
                  onClick={() => savePreferences({ matchReminders: !preferences.matchReminders })}
                  className={preferences.matchReminders 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-medium' 
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 font-medium border border-slate-600'}
                >
                  {preferences.matchReminders ? 'Enabled' : 'Disabled'}
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                <div>
                  <p className="text-white font-medium">Payment Alerts</p>
                  <p className="text-sm text-white/60">Get notified about deposits and withdrawals</p>
                </div>
                <Button
                  variant={preferences.paymentAlerts ? 'default' : 'secondary'}
                  size="sm"
                  disabled={saving}
                  onClick={() => savePreferences({ paymentAlerts: !preferences.paymentAlerts })}
                  className={preferences.paymentAlerts 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-medium' 
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 font-medium border border-slate-600'}
                >
                  {preferences.paymentAlerts ? 'Enabled' : 'Disabled'}
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/10">
                <div>
                  <p className="text-white font-medium">Marketing Emails</p>
                  <p className="text-sm text-white/60">Receive promotional content and offers</p>
                </div>
                <Button
                  variant={preferences.marketingEmails ? 'default' : 'secondary'}
                  size="sm"
                  disabled={saving}
                  onClick={() => savePreferences({ marketingEmails: !preferences.marketingEmails })}
                  className={preferences.marketingEmails 
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-medium' 
                    : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 font-medium border border-slate-600'}
                >
                  {preferences.marketingEmails ? 'Enabled' : 'Disabled'}
                </Button>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={loadPreferences}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium border border-blue-500"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertModal
        open={alert.open}
        onOpenChange={(open) => setAlert({ ...alert, open })}
        title={alert.title}
        message={alert.message}
        type={alert.type}
      />
    </>
  );
};
