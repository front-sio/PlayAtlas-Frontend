import { useEffect, useMemo, useState } from 'react';
import { lookupApi } from './apiService';

interface MatchLookupOptions {
  opponentIds?: string[];
  tournamentIds?: string[];
  agentUserIds?: string[];
  token?: string;
}

interface MatchLookupResult {
  opponents: Record<string, string>;
  opponentAvatars: Record<string, string>;
  tournaments: Record<string, string>;
  agents: Record<string, string>;
  loading: boolean;
}

const emptyLookup: MatchLookupResult = {
  opponents: {},
  opponentAvatars: {},
  tournaments: {},
  agents: {},
  loading: false,
};

export function useMatchLookup(options: MatchLookupOptions): MatchLookupResult {
  const { opponentIds = [], tournamentIds = [], agentUserIds = [], token } = options;

  const sanitizedOpponents = useMemo(
    () => Array.from(new Set(opponentIds.filter(Boolean).map(String))).sort(),
    [opponentIds]
  );
  const sanitizedTournaments = useMemo(
    () => Array.from(new Set(tournamentIds.filter(Boolean).map(String))).sort(),
    [tournamentIds]
  );
  const sanitizedAgents = useMemo(
    () => Array.from(new Set(agentUserIds.filter(Boolean).map(String))).sort(),
    [agentUserIds]
  );

  const [lookup, setLookup] = useState<MatchLookupResult>(emptyLookup);

  useEffect(() => {
    if (!sanitizedOpponents.length && !sanitizedTournaments.length && !sanitizedAgents.length) {
      setLookup({ ...emptyLookup });
      return;
    }
    let cancelled = false;
    setLookup((prev) => ({ ...prev, loading: true }));

    lookupApi
      .resolveMatchLookups(
        {
          opponentIds: sanitizedOpponents,
          tournamentIds: sanitizedTournaments,
          agentUserIds: sanitizedAgents,
        },
        token
      )
      .then((response) => {
        if (cancelled) return;
        const data = response?.data?.data || response?.data || {};
        setLookup({
          opponents: data.opponents || {},
          opponentAvatars: data.opponentAvatars || {},
          tournaments: data.tournaments || {},
          agents: data.agents || {},
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLookup({ ...emptyLookup });
      });

    return () => {
      cancelled = true;
    };
  }, [sanitizedOpponents.join(','), sanitizedTournaments.join(','), sanitizedAgents.join(','), token]);

  return lookup;
}
