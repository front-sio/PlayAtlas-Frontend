'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { matchmakingApi, tournamentApi } from '@/lib/apiService';
import { BilliardsMatchView } from '@/components/match/BilliardsMatchView';
import { getGameCategoryLabel, getGameRoute, normalizeGameCategory } from '@/lib/gameCategories';
import { Button } from '@/components/ui/button';

export default function GameMatchPage() {
  const { matchId, gameCategory } = useParams<{ matchId: string; gameCategory: string }>();
  const router = useRouter();
  const { status } = useSession();
  const [resolvedCategory, setResolvedCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const matchRes = await matchmakingApi.getMatchMultiplayer(String(matchId));
        const match = matchRes.data?.match;
        if (!match) {
          setError('Match not found');
          return;
        }

        let category = normalizeGameCategory(match.gameCategory) || null;
        if (!category && match.tournamentId) {
          const tournamentRes = await tournamentApi.getTournament(match.tournamentId);
          category = normalizeGameCategory(tournamentRes.data?.gameCategory) || null;
        }

        const effectiveCategory = category || 'BILLIARDS';
        setResolvedCategory(effectiveCategory);

        const requested = normalizeGameCategory(gameCategory) || effectiveCategory;
        if (requested !== effectiveCategory) {
          router.replace(getGameRoute(effectiveCategory, String(matchId)));
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load match');
      }
    };

    if (status === 'authenticated') {
      run();
    }
  }, [matchId, gameCategory, status, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white bg-black">
        {error}
      </div>
    );
  }

  if (!resolvedCategory) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white bg-black">
        Loading match...
      </div>
    );
  }

  if (resolvedCategory === 'BILLIARDS') {
    return <BilliardsMatchView matchId={String(matchId)} />;
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-semibold">{getGameCategoryLabel(resolvedCategory)} is coming soon</h1>
        <p className="text-white/70">
          This game category is not playable yet. We will notify you when it goes live.
        </p>
        <Button onClick={() => router.push('/game')}>Back to matches</Button>
      </div>
    </div>
  );
}
