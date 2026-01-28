export const GAME_CATEGORIES = {
  BILLIARDS: 'BILLIARDS',
  FOOTBALL: 'FOOTBALL',
  CAR_RACING: 'CAR_RACING',
  BIKE_RACING: 'BIKE_RACING'
} as const;

export type GameCategory = typeof GAME_CATEGORIES[keyof typeof GAME_CATEGORIES];

export const GAME_CATEGORY_OPTIONS: GameCategory[] = [
  GAME_CATEGORIES.BILLIARDS,
  GAME_CATEGORIES.FOOTBALL,
  GAME_CATEGORIES.CAR_RACING,
  GAME_CATEGORIES.BIKE_RACING
];

export const normalizeGameCategory = (value?: string | null): GameCategory | null => {
  if (!value) return null;
  const normalized = String(value).trim().toUpperCase();
  return GAME_CATEGORY_OPTIONS.includes(normalized as GameCategory) ? (normalized as GameCategory) : null;
};

export const getGameCategoryLabel = (value?: string | null) => {
  const normalized = normalizeGameCategory(value) || 'BILLIARDS';
  return normalized
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

export const getGameCategorySlug = (value?: string | null) => {
  const normalized = normalizeGameCategory(value) || 'BILLIARDS';
  return normalized.toLowerCase().replace(/_/g, '-');
};

export const getGameRoute = (gameCategory: string | null | undefined, matchId: string) =>
  `/play/${getGameCategorySlug(gameCategory)}/${matchId}`;
