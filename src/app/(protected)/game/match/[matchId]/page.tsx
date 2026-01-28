'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { matchmakingApi, tournamentApi } from '@/lib/apiService';
import { getGameRoute, normalizeGameCategory } from '@/lib/gameCategories';

export default function LegacyMatchRedirectPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const router = useRouter();
  const { status } = useSession();
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

        let gameCategory = normalizeGameCategory(match.gameCategory) || null;
        if (!gameCategory && match.tournamentId) {
          const tournamentRes = await tournamentApi.getTournament(match.tournamentId);
          const tournament = tournamentRes.data;
          gameCategory = normalizeGameCategory(tournament?.gameCategory) || null;
        }

        router.replace(getGameRoute(gameCategory || 'BILLIARDS', String(matchId)));
      } catch (err: any) {
        setError(err?.message || 'Failed to redirect to match');
      }
    };

    if (status === 'authenticated') {
      run();
    }
  }, [matchId, status, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white bg-black">
        {error}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center text-white bg-black">
      Redirecting to your match...
    </div>
  );
}
