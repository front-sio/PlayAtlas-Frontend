// Shared role and permission utilities for frontend
// This should match backend RBAC configuration

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  SUPERUSER: 'superuser',
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  FINANCE_MANAGER: 'finance_manager',
  TOURNAMENT_MANAGER: 'tournament_manager',
  GAME_MANAGER: 'game_manager',
  SUPPORT: 'support',
  STAFF: 'staff',
  MANAGER: 'manager',
  DIRECTOR: 'director',
  PLAYER: 'PLAYER', // Regular player role
  GAME_MASTER: 'GAME_MASTER'
} as const;

export type RoleType = typeof ROLES[keyof typeof ROLES];

// Permission definitions matching backend
export const PERMISSIONS = {
  // Users
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  USERS_ALL: 'users:*',

  // Tournaments
  TOURNAMENTS_READ: 'tournaments:read',
  TOURNAMENTS_CREATE: 'tournaments:create',
  TOURNAMENTS_UPDATE: 'tournaments:update',
  TOURNAMENTS_DELETE: 'tournaments:delete',
  TOURNAMENTS_ALL: 'tournaments:*',

  // Wallets
  WALLETS_READ: 'wallets:read',
  WALLETS_CREDIT: 'wallets:credit',
  WALLETS_DEBIT: 'wallets:debit',
  WALLETS_ALL: 'wallets:*',

  // Transactions
  TRANSACTIONS_READ: 'transactions:read',
  TRANSACTIONS_APPROVE: 'transactions:approve',
  TRANSACTIONS_ALL: 'transactions:*',

  // Games
  GAMES_READ: 'games:read',
  GAMES_UPDATE: 'games:update',
  GAMES_DELETE: 'games:delete',
  GAMES_ALL: 'games:*',

  // Reports
  REPORTS_READ: 'reports:read',
  REPORTS_FINANCIAL: 'reports:financial',
  REPORTS_ALL: 'reports:*',

  // Settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_ALL: 'settings:*',

  // Logs
  LOGS_READ: 'logs:read',

  // Dashboard
  DASHBOARD_READ: 'dashboard:read',

  // Matches
  MATCHES_ALL: 'matches:*',

  // Players
  PLAYERS_READ: 'players:read',

  // Tickets
  TICKETS_ALL: 'tickets:*',

  // All permissions
  ALL: '*'
} as const;

// Role to permissions mapping (must match backend)
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: [PERMISSIONS.ALL],
  superuser: [PERMISSIONS.ALL],
  superadmin: [PERMISSIONS.ALL],
  admin: [
    PERMISSIONS.USERS_ALL,
    PERMISSIONS.TOURNAMENTS_ALL,
    PERMISSIONS.WALLETS_ALL,
    PERMISSIONS.REPORTS_ALL,
    PERMISSIONS.SETTINGS_ALL,
    PERMISSIONS.LOGS_READ,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.GAMES_ALL
  ],
  moderator: [
    PERMISSIONS.USERS_READ,
    PERMISSIONS.TOURNAMENTS_READ,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.GAMES_READ,
    PERMISSIONS.DASHBOARD_READ
  ],
  finance_manager: [
    PERMISSIONS.WALLETS_ALL,
    PERMISSIONS.TRANSACTIONS_ALL,
    PERMISSIONS.REPORTS_FINANCIAL,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.TOURNAMENTS_READ
  ],
  tournament_manager: [
    PERMISSIONS.TOURNAMENTS_ALL,
    PERMISSIONS.MATCHES_ALL,
    PERMISSIONS.PLAYERS_READ,
    PERMISSIONS.GAMES_READ,
    PERMISSIONS.DASHBOARD_READ
  ],
  game_manager: [
    PERMISSIONS.TOURNAMENTS_ALL,
    PERMISSIONS.GAMES_ALL,
    PERMISSIONS.DASHBOARD_READ
  ],
  game_master: [
    PERMISSIONS.TOURNAMENTS_ALL,
    PERMISSIONS.GAMES_ALL,
    PERMISSIONS.DASHBOARD_READ
  ],
  support: [
    PERMISSIONS.USERS_READ,
    PERMISSIONS.TOURNAMENTS_READ,
    PERMISSIONS.TICKETS_ALL,
    PERMISSIONS.DASHBOARD_READ
  ],
  staff: [
    PERMISSIONS.USERS_READ,
    PERMISSIONS.WALLETS_READ,
    PERMISSIONS.TOURNAMENTS_READ,
    PERMISSIONS.GAMES_READ,
    PERMISSIONS.DASHBOARD_READ
  ],
  manager: [
    PERMISSIONS.USERS_ALL,
    PERMISSIONS.TOURNAMENTS_ALL,
    PERMISSIONS.WALLETS_ALL,
    PERMISSIONS.REPORTS_ALL,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.GAMES_ALL
  ],
  director: [
    PERMISSIONS.USERS_ALL,
    PERMISSIONS.TOURNAMENTS_ALL,
    PERMISSIONS.WALLETS_ALL,
    PERMISSIONS.REPORTS_ALL,
    PERMISSIONS.SETTINGS_ALL,
    PERMISSIONS.LOGS_READ,
    PERMISSIONS.DASHBOARD_READ,
    PERMISSIONS.GAMES_ALL
  ]
};

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: string | undefined, permission: string): boolean {
  if (!role) return false;

  const permissions = ROLE_PERMISSIONS[role.toLowerCase()] || [];

  // Check for wildcard all permissions
  if (permissions.includes(PERMISSIONS.ALL)) return true;

  // Check exact match
  if (permissions.includes(permission)) return true;

  // Check resource wildcard (e.g., users:* matches users:read)
  const [resource] = permission.split(':');
  if (permissions.includes(`${resource}:*`)) return true;

  return false;
}

/**
 * Check if user has any admin role
 */
export function isAdminRole(role: string | undefined): boolean {
  if (!role) return false;
  
  const adminRoles = [
    ROLES.SUPER_ADMIN,
    ROLES.SUPERUSER,
    ROLES.SUPERADMIN,
    ROLES.ADMIN,
    ROLES.MODERATOR,
    ROLES.FINANCE_MANAGER,
    ROLES.TOURNAMENT_MANAGER,
    ROLES.GAME_MANAGER,
    ROLES.SUPPORT,
    ROLES.STAFF,
    ROLES.MANAGER,
    ROLES.DIRECTOR,
    ROLES.GAME_MASTER
  ];

  return adminRoles.includes(role.toLowerCase() as any);
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role: string | undefined): string {
  if (!role) return 'Unknown';

  const displayNames: Record<string, string> = {
    super_admin: 'Super Admin',
    superuser: 'Superuser',
    superadmin: 'Superadmin',
    admin: 'Admin',
    moderator: 'Moderator',
    finance_manager: 'Finance Manager',
    tournament_manager: 'Tournament Manager',
    game_manager: 'Game Manager',
    support: 'Support',
    staff: 'Staff',
    manager: 'Manager',
    director: 'Director',
    PLAYER: 'Player',
    GAME_MASTER: 'Game Master',
    game_master: 'Game Master'
  };

  return displayNames[role] || role;
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: string | undefined): string[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role.toLowerCase()] || [];
}

/**
 * Check if role can access admin dashboard
 */
export function canAccessAdmin(role: string | undefined): boolean {
  return hasPermission(role, PERMISSIONS.DASHBOARD_READ);
}

/**
 * Check if role can manage tournaments
 */
export function canManageTournaments(role: string | undefined): boolean {
  return hasPermission(role, PERMISSIONS.TOURNAMENTS_UPDATE) ||
         hasPermission(role, PERMISSIONS.TOURNAMENTS_DELETE);
}

export function canCreateTournaments(role: string | undefined): boolean {
  return hasPermission(role, PERMISSIONS.TOURNAMENTS_CREATE);
}

/**
 * Check if role can view tournaments
 */
export function canViewTournaments(role: string | undefined): boolean {
  return hasPermission(role, PERMISSIONS.TOURNAMENTS_READ);
}

/**
 * Check if role can manage wallets
 */
export function canManageWallets(role: string | undefined): boolean {
  return hasPermission(role, PERMISSIONS.WALLETS_CREDIT) ||
         hasPermission(role, PERMISSIONS.WALLETS_DEBIT);
}

/**
 * Check if role can view wallets
 */
export function canViewWallets(role: string | undefined): boolean {
  return hasPermission(role, PERMISSIONS.WALLETS_READ);
}

/**
 * Check if role can approve transactions
 */
export function canApproveTransactions(role: string | undefined): boolean {
  return hasPermission(role, PERMISSIONS.TRANSACTIONS_APPROVE);
}

/**
 * Check if role can manage users
 */
export function canManageUsers(role: string | undefined): boolean {
  return hasPermission(role, PERMISSIONS.USERS_CREATE) ||
         hasPermission(role, PERMISSIONS.USERS_UPDATE) ||
         hasPermission(role, PERMISSIONS.USERS_DELETE);
}

/**
 * Check if role can view financial reports
 */
export function canViewFinancialReports(role: string | undefined): boolean {
  return hasPermission(role, PERMISSIONS.REPORTS_FINANCIAL);
}

/**
 * Check if role can manage settings
 */
export function canManageSettings(role: string | undefined): boolean {
  return hasPermission(role, PERMISSIONS.SETTINGS_UPDATE);
}
