'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { tournamentApi, matchmakingApi, walletApi, lookupApi } from '@/lib/apiService';
import { Button } from '@/components/ui/button';
import { Clock, Wifi, WifiOff } from 'lucide-react';

type Match = {
  matchId: string;
  tournamentId: string;
  seasonId?: string | null;
  player1Id: string;
  player2Id: string;
  status: string;
  startedAt?: string | null;
  endedAt?: string | null;
  metadata?: {
    matchDurationSeconds?: number;
  } | null;
};

export default function PlayMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();

  const playerId = session?.user?.userId;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [canPlay, setCanPlay] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [scoreState, setScoreState] = useState({ player1: 0, player2: 0 });
  const resultSentRef = useRef(false);
  const [playerNames, setPlayerNames] = useState<{ player1?: string; player2?: string }>({});

  const matchDurationSeconds = useMemo(() => {
    const raw = match?.metadata?.matchDurationSeconds;
    return Number(raw || 300);
  }, [match]);

  const iframeSrc = useMemo(() => {
    if (!match || !session?.user) return '';
    
    const params = new URLSearchParams({
      autostart: '1',
      mode: 'match',
      matchId: String(matchId),
      matchDurationSeconds: String(matchDurationSeconds),
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      player1Name: playerNames.player1 || '',
      player2Name: playerNames.player2 || ''
    });
    // Use original 8ball for multiplayer matches
    return `/8ball-match/index.html?${params.toString()}`;
  }, [match, matchDurationSeconds, matchId, playerNames, session?.user]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  useEffect(() => {
    const run = async () => {
      if (!playerId) return;
      setLoading(true);
      setError(null);

      try {
        const matchRes = await matchmakingApi.getMatch(String(matchId));
        const matchData = matchRes.data?.match as Match | undefined;
        
        if (!matchData) {
          throw new Error('Match not found');
        }

        if (matchData.player1Id !== playerId && matchData.player2Id !== playerId) {
          throw new Error('You are not a participant in this match');
        }

        if (!matchData.seasonId) {
          throw new Error('Match is not associated with a season');
        }

        const seasonRes = await tournamentApi.getSeason(matchData.seasonId);
        const seasonData = seasonRes.data as any;
        const joined = !!seasonData?.tournamentPlayers?.some(
          (p: any) => p.playerId === playerId
        );
        if (!joined) {
          throw new Error('You must join the season (and pay the fee) before playing this match');
        }

        const seasonStatus = String(seasonData?.status || '');
        const seasonEndedStatuses = new Set(['completed', 'finished', 'cancelled']);
        const seasonEndTime = seasonData?.endTime
          ? new Date(seasonData.endTime).getTime()
          : seasonData?.startTime
            ? new Date(seasonData.startTime).getTime() + 1200 * 1000
            : null;
        if (seasonEndedStatuses.has(seasonStatus) || (seasonEndTime && Date.now() > seasonEndTime)) {
          throw new Error('Season has ended');
        }

        if (['completed', 'cancelled'].includes(matchData.status)) {
          throw new Error('Match has ended');
        }
        if (matchData.endedAt) {
          throw new Error('Match has ended');
        }
        if (matchData.startedAt) {
          const matchEndTime = new Date(matchData.startedAt).getTime() + matchDurationSeconds * 1000;
          if (Date.now() > matchEndTime) {
            throw new Error('Match time has expired');
          }
        }

        await walletApi.getWallet(session?.accessToken || '');

        setMatch(matchData);
        const opponentId = matchData.player1Id === playerId ? matchData.player2Id : matchData.player1Id;
        const lookup = await lookupApi.resolveMatchLookups(
          {
            opponentIds: [opponentId],
            tournamentIds: [matchData.tournamentId]
          },
          session?.accessToken
        ).catch(() => null);

        const opponents = lookup?.data?.data?.opponents || lookup?.data?.opponents || {};
        const opponentName = opponents?.[opponentId];
        const currentName = session?.user?.username || `${session?.user?.firstName || ''} ${session?.user?.lastName || ''}`.trim();
        setPlayerNames({
          player1: matchData.player1Id === playerId ? currentName : (opponentName || matchData.player1Id),
          player2: matchData.player2Id === playerId ? currentName : (opponentName || matchData.player2Id)
        });
        setCanPlay(true);
      } catch (err: any) {
        setError(err?.message || 'Failed to load match');
        setCanPlay(false);
      } finally {
        setLoading(false);
      }
    };

    if (status === 'authenticated') {
      run();
    }
  }, [matchId, playerId, status, session?.accessToken, matchDurationSeconds]);

  // Send player data to iframe when it loads
  useEffect(() => {
    if (iframeLoaded && session?.user && match) {
      const iframe = document.querySelector('iframe');
      if (iframe?.contentWindow) {
        const playerData = {
          type: 'SET_PLAYER_DATA',
          data: {
            playerId: session.user.userId,
            playerName: session.user.username || `${session.user.firstName} ${session.user.lastName}`.trim(),
            token: session.accessToken,
            mode: 'match',
            matchId: String(matchId)
          }
        };
        
        iframe.contentWindow.postMessage(playerData, window.location.origin);
      }
    }
  }, [iframeLoaded, session, match, matchId]);

  // Listen for game events from iframe
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      const { type, data } = event.data;
      switch (type) {
        case 'GAME_STATE_CHANGED':
          console.log('Game state changed:', data.state);
          break;
        case 'SCORE_UPDATE':
          setScoreState({
            player1: Number(data?.player1Score || 0),
            player2: Number(data?.player2Score || 0)
          });
          break;
        case 'MATCH_COMPLETED': {
          if (resultSentRef.current || !match) break;
          resultSentRef.current = true;
          const winnerId = data?.winnerId;
          const player1Score = Number(data?.scores?.player1 || 0);
          const player2Score = Number(data?.scores?.player2 || 0);
          if (winnerId) {
            await matchmakingApi.updateMatchResult(
              match.matchId,
              { winnerId, player1Score, player2Score },
              session?.accessToken
            ).catch(() => null);
          }
          setTimeout(() => {
            router.push('/game');
          }, 3000);
          break;
        }
        case 'CONNECTION_ERROR':
          console.error('Game connection error:', data.error);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [match, router, session?.accessToken]);

  const handleIframeLoad = () => {
    setIframeLoaded(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border border-white/20 border-t-white mx-auto"></div>
          <p className="text-white/70 text-sm">Loading match...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-center space-y-4 max-w-sm px-4">
          <p className="text-red-200">{error}</p>
          <Button className="border-white/20 text-white" onClick={() => router.push('/game')}>
            Back to matches
          </Button>
        </div>
      </div>
    );
  }

  if (!match || !canPlay) {
    return null;
  }

  return (
    <div className="relative w-full h-full">
      <iframe
        key={iframeSrc}
        src={iframeSrc}
        title="8-ball match"
        className="absolute inset-0 h-full w-full border-0"
        allow="autoplay; fullscreen"
        allowFullScreen
        onLoad={handleIframeLoad}
      />
      
      {/* Connection status indicator */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-3 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4 text-green-400" />
          <span className="text-xs text-white/80">
            Match: {matchId?.substring(0, 8)}...
          </span>
        </div>
      </div>

      <div className="absolute top-4 left-4 z-30 flex items-center gap-4 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 text-white/90 text-xs">
        <div>
          {playerNames.player1 || match.player1Id.slice(0, 6)}: {scoreState.player1}
        </div>
        <div>
          {playerNames.player2 || match.player2Id.slice(0, 6)}: {scoreState.player2}
        </div>
      </div>
    </div>
  );
}
