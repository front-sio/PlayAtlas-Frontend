// User and Player Types
export interface User {
  id: string;
  email: string;
  username: string;
  role: 'PLAYER' | 'GAME_MASTER' | 'FINANCE_OFFICER_DEPOSITS' | 'FINANCE_OFFICER_PAYOUTS' | 'ADMIN' | 'MANAGER' | 'DIRECTOR';
  emailVerified: boolean;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface Player {
  id: string;
  userId: string;
  displayName: string;
  avatar?: string;
  level: number;
  experience: number;
  wins: number;
  losses: number;
  draws: number;
  rating: number;
  isActive: boolean;
  createdAt: string;
  user?: User;
  wallet?: Wallet;
}

export interface Wallet {
  id: string;
  playerId: string;
  balance: number;
  frozenBalance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  lipaNaMumba?: string;
  createdAt: string;
}

// Tournament Types
export interface Tournament {
  id: string;
  name: string;
  description?: string;
  entryFee: number;
  prizePool: number; // Calculated field (not for creation)
  platformFee: number;
  transactionFee: number;
  maxPlayers: number;
  isActive: boolean;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  startTime?: string; // Backend uses startTime, not startDate
  endTime?: string;   // Backend uses endTime, not endDate
  createdAt: string;
  seasons?: Season[];
}

// Data structure for creating a tournament
export interface CreateTournamentData {
  name: string;
  description?: string;
  entryFee: number;
  maxPlayers?: number;
  startTime?: string; // ISO8601 format
  seasonDuration?: number; // in seconds
}

export interface Season {
  id: string;
  tournamentId: string;
  seasonNumber: number;
  entryFee: number;
  prizePool: number;
  maxPlayers: number;
  status: 'OPEN' | 'CLOSED' | 'FIXTURE_GENERATED' | 'IN_PROGRESS' | 'COMPLETED';
  joinDeadline: string;
  fixtureGenerated: boolean;
  createdAt: string;
  tournament?: Tournament;
  matches?: Match[];
}

export interface Match {
  id: string;
  seasonId: string;
  player1Id: string;
  player2Id: string;
  player1Score: number;
  player2Score: number;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  scheduledAt: string;
  startedAt?: string;
  finishedAt?: string;
  winnerId?: string;
  season?: Season;
}

// Achievement Types
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon?: string;
  points: number;
  createdAt: string;
}

export interface PlayerAchievement {
  id: string;
  playerId: string;
  achievementId: string;
  unlockedAt: string;
  achievement?: Achievement;
}

// Game Types
export interface GameState {
  id: string;
  player1Id: string;
  player2Id: string;
  status: 'waiting' | 'playing' | 'finished';
  currentPlayer: string;
  balls: Ball[];
  tableState: TableState;
  scores: {
    player1: number;
    player2: number;
  };
  startTime?: string;
  endTime?: string;
  winner?: string;
}

export interface Ball {
  id: number;
  type: 'cue' | 'solid' | 'stripe' | '8ball';
  color: string;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  isPocketed: boolean;
}

export interface TableState {
  width: number;
  height: number;
  pockets: Pocket[];
  friction: number;
}

export interface Pocket {
  id: number;
  x: number;
  y: number;
  radius: number;
}

// Transaction Types
export interface Transaction {
  id: string;
  walletId: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'TOURNAMENT_ENTRY' | 'TOURNAMENT_WIN' | 'FEE' | 'REFUND';
  amount: number;
  fee: number;
  description: string;
  reference?: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  metadata?: any;
  createdAt: string;
}

export interface DepositRequest {
  id: string;
  walletId: string;
  amount: number;
  provider: string;
  transactionId?: string;
  message?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface PayoutRequest {
  id: string;
  walletId: string;
  amount: number;
  lipaNaMumba: string;
  provider: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSED';
  approvedBy?: string;
  approvedAt?: string;
  processedAt?: string;
  createdAt: string;
}

// Notification Types
export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'TOURNAMENT' | 'MATCH' | 'PAYMENT' | 'SYSTEM' | 'ACHIEVEMENT';
  isRead: boolean;
  metadata?: any;
  createdAt: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T = any> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Form Types
export interface RegisterData {
  email: string;
  username: string;
  password: string;
  displayName: string;
  lipaNaMumba?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface OTPData {
  email: string;
  otp: string;
}

// Player Stats
export interface PlayerStats {
  basic: {
    level: number;
    rating: number;
    wins: number;
    losses: number;
    draws: number;
    totalMatches: number;
    winRate: number;
  };
  recent: any[];
  achievements: PlayerAchievement[];
}

// Leaderboard
export interface LeaderboardEntry {
  id: string;
  displayName: string;
  level: number;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  rank: number;
  winRate: number;
  totalGames: number;
  user: {
    username: string;
  };
}