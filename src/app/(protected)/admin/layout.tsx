'use client';

import { useSession } from 'next-auth/react';
import { AdminShell } from '@/components/layout/AdminShell';
import { AccessDenied } from '@/components/admin/AccessDenied';

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
  ].includes((role || '').toLowerCase());

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;

  if (!isAdminRole(role)) {
    return <AccessDenied message="You do not have permission to access the admin panel." />;
  }

  return <AdminShell>{children}</AdminShell>;
}
