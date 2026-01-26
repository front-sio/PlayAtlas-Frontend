 'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { adminApi } from '@/lib/apiService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { canManageTournaments } from '@/lib/permissions';

interface Club {
  clubId: string;
  name: string;
  locationText?: string | null;
  status?: string;
  createdAt?: string;
}

export default function AdminClubsPage() {
  const { data: session, status } = useSession();
  const token = (session as any)?.accessToken;
  const role = (session?.user as any)?.role;
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    locationText: '',
    status: 'active'
  });

  useEffect(() => {
    if (!token || !canManageTournaments(role)) return;
    loadClubs();
  }, [token, role]);

  const loadClubs = async () => {
    try {
      setLoading(true);
      const result = await adminApi.getClubs(token, undefined, 100, 0);
      if (result.success && result.data) {
        const payload = (result.data as any)?.data || result.data;
        setClubs((payload || []) as Club[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load clubs');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    try {
      setCreating(true);
      setError('');
      const payload = {
        name: form.name,
        locationText: form.locationText || null,
        status: form.status
      };
      const result = await adminApi.createClub(token, payload);
      if (result.success) {
        setForm({ name: '', locationText: '', status: 'active' });
        await loadClubs();
      } else {
        setError(result.error || 'Failed to create club');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create club');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (clubId: string) => {
    if (!token) return;
    try {
      setError('');
      await adminApi.deleteClub(token, clubId);
      setClubs((prev) => prev.filter((club) => club.clubId !== clubId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete club');
    }
  };

  if (status === 'authenticated' && role && !canManageTournaments(role)) {
    return <AccessDenied message="You do not have permission to manage clubs." />;
  }

  return (
    <div className="container mx-auto py-10 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Club</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreate}>
            <Input
              value={form.name}
              onChange={(event) => handleChange('name', event.target.value)}
              placeholder="Club name"
              required
            />
            <Input
              value={form.locationText}
              onChange={(event) => handleChange('locationText', event.target.value)}
              placeholder="Location (optional)"
            />
            <select
              value={form.status}
              onChange={(event) => handleChange('status', event.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm md:col-span-2"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <div className="md:col-span-2">
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create Club'}
              </Button>
            </div>
          </form>
          {error && (
            <div className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clubs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading clubs...</p>
          ) : clubs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clubs found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {clubs.map((club) => (
                    <tr key={club.clubId} className="border-b last:border-0">
                      <td className="px-3 py-3">{club.name}</td>
                      <td className="px-3 py-3">{club.locationText || '-'}</td>
                      <td className="px-3 py-3">{club.status || 'active'}</td>
                      <td className="px-3 py-3">
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(club.clubId)}>
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
