'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { adminApi } from '@/lib/apiService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { ResponsiveTable } from '@/components/admin/ResponsiveTable';

interface AdminUser {
  userId: string;
  username: string;
  email: string;
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  role: string;
  isActive: boolean;
  isVerified: boolean;
  lastLogin?: string;
  createdAt?: string;
}

const roles = [
  'player',
  'admin',
  'staff',
  'manager',
  'director',
  'super_admin',
  'superuser',
  'superadmin',
  'moderator',
  'finance_manager',
  'tournament_manager',
  'game_manager',
  'game_master',
  'support',
];

const isAdminRole = (role?: string) =>
  [
    'admin',
    'staff',
    'manager',
    'director',
    'super_admin',
    'superuser',
    'superadmin',
    'moderator',
    'finance_manager',
    'tournament_manager',
    'game_manager',
    'game_master',
    'support'
  ]
    .includes((role || '').toLowerCase());

export default function AdminUsersPage() {
  const { data: session, status } = useSession();
  const token = (session as any)?.accessToken;
  const role = (session?.user as any)?.role;
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [suspendReason, setSuspendReason] = useState('');

  useEffect(() => {
    if (!token || !isAdminRole(role)) return;
    loadUsers();
  }, [token, role]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const result = await adminApi.getUsers(token, undefined, 100, 0);
      if (result.success && result.data) {
        setUsers(result.data as AdminUser[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const term = search.toLowerCase();
    return users.filter((user) =>
      `${user.firstName || ''} ${user.lastName || ''} ${user.username} ${user.email} ${user.phoneNumber}`
        .toLowerCase()
        .includes(term)
    );
  }, [search, users]);

  const handleRoleUpdate = async () => {
    if (!selectedUser || !selectedRole) return;
    try {
      const result = await adminApi.updateUser(token, selectedUser.userId, { role: selectedRole });
      if (result.success) {
        setUsers((prev) =>
          prev.map((user) =>
            user.userId === selectedUser.userId ? { ...user, role: selectedRole } : user
          )
        );
        setSelectedUser(null);
        setSelectedRole('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleSuspend = async () => {
    if (!selectedUser) return;
    try {
      const result = await adminApi.suspendUser(token, selectedUser.userId, suspendReason || 'Policy violation');
      if (result.success) {
        setUsers((prev) =>
          prev.map((user) =>
            user.userId === selectedUser.userId ? { ...user, isActive: false } : user
          )
        );
        setSelectedUser(null);
        setSuspendReason('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to suspend user');
    }
  };

  const handleActivate = async (userId: string) => {
    try {
      const result = await adminApi.updateUser(token, userId, { isActive: true });
      if (result.success) {
        setUsers((prev) =>
          prev.map((user) => (user.userId === userId ? { ...user, isActive: true } : user))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate user');
    }
  };

  const columns = useMemo(() => [
    {
      key: 'name' as keyof AdminUser,
      label: 'Name',
      mobilePriority: 'high' as const,
      render: (value, item) => item.firstName || item.lastName 
        ? `${item.firstName || ''} ${item.lastName || ''}`.trim() 
        : item.username,
    },
    {
      key: 'email' as keyof AdminUser,
      label: 'Email',
      mobilePriority: 'medium' as const,
    },
    {
      key: 'role' as keyof AdminUser,
      label: 'Role',
      mobilePriority: 'high' as const,
    },
    {
      key: 'status' as keyof AdminUser,
      label: 'Status',
      mobilePriority: 'high' as const,
      render: (value, item) => (
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            item.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {item.isActive ? 'Active' : 'Suspended'}
        </span>
      ),
    },
    {
      key: 'actions' as keyof AdminUser,
      label: 'Action',
      mobilePriority: 'high' as const,
      render: (value, item) => (
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedUser(item);
              setSelectedRole(item.role);
            }}
          >
            Manage
          </Button>
          {!item.isActive && (
            <Button
              
              size="sm"
              onClick={() => handleActivate(item.userId)}
            >
              Activate
            </Button>
          )}
        </div>
      ),
    },
  ], []);

  if (status === 'authenticated' && role && !isAdminRole(role)) {
    return <AccessDenied message="You do not have permission to view user management." />;
  }

  return (
    <div className="container mx-auto py-10">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Manage Users</CardTitle>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search users..."
            className="md:max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading users...</p>
          ) : (
            <ResponsiveTable
              data={filteredUsers}
              columns={columns}
              keyExtractor={(item) => item.userId}
              emptyMessage="No users found."
            />
          )}
        </CardContent>
      </Card>

      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Manage {selectedUser.username}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Role</label>
                <select
                  value={selectedRole}
                  onChange={(event) => setSelectedRole(event.target.value)}
                  className="mt-2 w-full rounded border border-input bg-background px-3 py-2 text-sm"
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <Button className="mt-2 w-full" onClick={handleRoleUpdate}>
                  Update Role
                </Button>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Suspend Reason</label>
                <Input
                  value={suspendReason}
                  onChange={(event) => setSuspendReason(event.target.value)}
                  placeholder="Reason for suspension"
                  className="mt-2"
                />
                <Button variant="destructive" className="mt-2 w-full" onClick={handleSuspend}>
                  Suspend User
                </Button>
              </div>

              <Button variant="ghost" className="w-full" onClick={() => setSelectedUser(null)}>
                Close
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
