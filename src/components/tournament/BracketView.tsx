"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, Trophy, ArrowRight, CheckCircle, Play, AlertCircle } from "lucide-react";

type MatchStatus = string;

export interface Match {
  matchId: string;
  matchNumber: number;
  round: string;
  groupLabel?: string;

  player1Id?: string;
  player2Id?: string;
  player1Score: number;
  player2Score: number;
  winnerId?: string;

  status: MatchStatus;
  scheduledStartAt?: string;

  assignedDeviceId?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  assignedDeviceName?: string;

  // Bracket links (if your backend supports it)
  winnerAdvancesToMatchId?: string;
  winnerAdvancesToSlot?: "A" | "B" | string;

  isPlayerMatch: boolean;
  playerPosition?: number;
}

export interface FixturesPayload {
  seasonId: string;
  fixturesByRound: Record<string, Match[]>;
  totalFixtures: number;
  playerMatches: number;
  playerContext?: {
    eliminated?: boolean;
    isChampion?: boolean;
    qualified?: boolean;
  };
}

export function BracketViewFullMap({ fixtures }: { fixtures: FixturesPayload }) {
  const { fixturesByRound } = fixtures;

  const allMatches = useMemo(() => Object.values(fixturesByRound).flat(), [fixturesByRound]);

  const byId = useMemo(() => {
    const m = new Map<string, Match>();
    allMatches.forEach((x) => m.set(x.matchId, x));
    return m;
  }, [allMatches]);

  const groups = ["A", "B", "C", "D", "E", "F", "G", "H"];

  const groupMatchesByLabel = useMemo(() => {
    const out: Record<string, Match[]> = {};
    groups.forEach((g) => (out[g] = []));
    (fixturesByRound["GROUP"] || []).forEach((m) => {
      const g = (m.groupLabel || "").toUpperCase();
      if (!out[g]) out[g] = [];
      out[g].push(m);
    });
    // sort by scheduled time then matchNumber
    Object.keys(out).forEach((g) => {
      out[g].sort((a, b) => {
        const ta = a.scheduledStartAt ? new Date(a.scheduledStartAt).getTime() : 0;
        const tb = b.scheduledStartAt ? new Date(b.scheduledStartAt).getTime() : 0;
        if (ta !== tb) return ta - tb;
        return (a.matchNumber || 0) - (b.matchNumber || 0);
      });
    });
    return out;
  }, [fixturesByRound]);

  const normalizeRound = (r?: string) => (r || "").toUpperCase().trim();

  const knockoutRounds = useMemo(() => {
    // Support both R16-style and QF/SF/FINAL style
    const keys = Object.keys(fixturesByRound).map(normalizeRound);
    const hasR16 = keys.includes("R16");
    const hasQF = keys.includes("QF");
    const hasSF = keys.includes("SF");
    const hasFINAL = keys.includes("FINAL");

    const order: string[] = [];
    if (keys.includes("R32")) order.push("R32");
    if (hasR16) order.push("R16");
    if (hasQF) order.push("QF");
    if (hasSF) order.push("SF");
    if (hasFINAL) order.push("FINAL");

    // If backend only uses R8/R4/R2 style:
    if (!order.length) {
      if (keys.includes("R16")) order.push("R16");
      if (keys.includes("R8")) order.push("R8");
      if (keys.includes("R4")) order.push("R4");
      if (keys.includes("R2")) order.push("R2");
    }

    return order.map((k) => ({
      key: k,
      matches: (fixturesByRound[k] || fixturesByRound[k.toLowerCase()] || []).slice().sort((a, b) => {
        const ta = a.scheduledStartAt ? new Date(a.scheduledStartAt).getTime() : 0;
        const tb = b.scheduledStartAt ? new Date(b.scheduledStartAt).getTime() : 0;
        if (ta !== tb) return ta - tb;
        return (a.matchNumber || 0) - (b.matchNumber || 0);
      }),
    }));
  }, [fixturesByRound]);

  const finalMatch = useMemo(() => {
    const finals = fixturesByRound["FINAL"] || fixturesByRound["R2"] || [];
    return finals?.[0];
  }, [fixturesByRound]);

  return (
    <div className="space-y-6">
      {/* HERO */}
      <Card className="bg-black/20 border-white/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-white flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Tournament Map (Groups + Bracket)
            <Badge variant="secondary" className="ml-auto">
              Full Path
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs uppercase text-white/60 font-semibold">Group Stage</div>
              <div className="text-sm text-white/80 mt-1">
                Groups A–H are shown below (even if empty) so players can see the full structure.
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-xs uppercase text-white/60 font-semibold">Who meets next</div>
              {finalMatch ? (
                <div className="mt-2 space-y-1">
                  <div className="text-sm text-white font-semibold">Final</div>
                  <div className="text-sm text-white/85">
                    {playerLabel(finalMatch.player1Id)} <span className="text-white/50">vs</span>{" "}
                    {playerLabel(finalMatch.player2Id)}
                  </div>
                  <div className="text-xs text-white/65 flex items-center gap-2">
                    <Clock className="h-3 w-3" /> {fmtTime(finalMatch.scheduledStartAt)}
                  </div>
                  <div className="text-xs text-white/65 flex items-center gap-2">
                    <MapPin className="h-3 w-3" /> {deskLabel(finalMatch)}
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-white/70">Final not generated yet</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* GROUPS MAP (A–H) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">Group Stage (All Groups)</h3>
          <Badge variant="secondary">{(fixturesByRound["GROUP"] || []).length} group matches</Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groups.map((g) => (
            <Card key={g} className="bg-black/20 border-white/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-white flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-bold">
                    {g}
                  </span>
                  Group {g}
                  <Badge variant="secondary" className="ml-auto">
                    {groupMatchesByLabel[g]?.length || 0}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                {groupMatchesByLabel[g]?.length ? (
                  <div className="space-y-2">
                    {groupMatchesByLabel[g].map((m) => (
                      <MiniMatchCard key={m.matchId} match={m} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-3 text-sm text-white/60">
                    No matches in this group yet.
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* KNOCKOUT BRACKET MAP */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">Knockout Bracket</h3>
          <Badge variant="secondary">
            {knockoutRounds.reduce((sum, r) => sum + (r.matches?.length || 0), 0)} matches
          </Badge>
        </div>

        <div className="w-full overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-4 gap-3">
              {["R16", "QF", "SF", "FINAL"].map((rk) => {
                const r = knockoutRounds.find((x) => x.key === rk) || { key: rk, matches: [] as Match[] };
                return (
                  <div key={rk} className="space-y-2">
                    <div className="sticky top-0 z-10 rounded-xl border border-white/10 bg-black/30 p-2">
                      <div className="text-sm font-semibold text-white">{roundTitle(rk)}</div>
                      <div className="text-xs text-white/60">{r.matches.length ? `${r.matches.length} matches` : "—"}</div>
                    </div>

                    {r.matches.length ? (
                      <div className="space-y-2">
                        {r.matches.map((m) => (
                          <BracketMatchCard
                            key={m.matchId}
                            match={m}
                            next={m.winnerAdvancesToMatchId ? byId.get(m.winnerAdvancesToMatchId) : undefined}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/15 bg-white/5 p-3 text-xs text-white/60">
                        No matches for this round yet.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="text-xs text-white/50">
          Tip: Bracket shows the full path. If your backend provides <span className="font-mono">winnerAdvancesToMatchId</span>, players can see exactly which match they will go to next.
        </div>
      </div>
    </div>
  );
}

/* ---------------- UI PARTS ---------------- */

function fmtTime(dateString?: string) {
  if (!dateString) return "TBD";
  return new Date(dateString).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function playerLabel(id?: string) {
  if (!id) return "TBD";
  return `Player ${id.slice(-4)}`;
}

function deskLabel(m: Match) {
  const agent = m.assignedAgentName || (m.assignedAgentId ? `Agent ${m.assignedAgentId.slice(-4)}` : "Agent TBD");
  const device = m.assignedDeviceName || (m.assignedDeviceId ? `Device ${m.assignedDeviceId.slice(-1)}` : "Device TBD");
  return `${agent} • ${device}`;
}

function statusMeta(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "COMPLETED") return { label: "Completed", Icon: CheckCircle, cls: "bg-green-600/15 text-green-200 border-green-500/25" };
  if (s === "IN_PROGRESS") return { label: "Live", Icon: Play, cls: "bg-yellow-600/15 text-yellow-200 border-yellow-500/25" };
  if (s === "READY") return { label: "Ready", Icon: AlertCircle, cls: "bg-blue-600/15 text-blue-200 border-blue-500/25" };
  return { label: "Scheduled", Icon: Clock, cls: "bg-white/10 text-white/70 border-white/15" };
}

function roundTitle(r: string) {
  if (r === "R16") return "Round of 16";
  if (r === "QF") return "Quarterfinals";
  if (r === "SF") return "Semifinals";
  if (r === "FINAL") return "Final";
  return r;
}

function MiniMatchCard({ match }: { match: Match }) {
  const meta = statusMeta(match.status);
  const Icon = meta.Icon;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-white/90 truncate">
            {playerLabel(match.player1Id)} <span className="text-white/50">vs</span> {playerLabel(match.player2Id)}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-white/65">
            <Clock className="h-3 w-3" /> {fmtTime(match.scheduledStartAt)}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-white/65">
            <MapPin className="h-3 w-3" /> {deskLabel(match)}
          </div>
        </div>

        <Badge className={`border ${meta.cls}`}>
          <Icon className="h-3 w-3 mr-1" />
          {meta.label}
        </Badge>
      </div>
    </div>
  );
}

function BracketMatchCard({ match, next }: { match: Match; next?: Match }) {
  const meta = statusMeta(match.status);
  const Icon = meta.Icon;

  const winnerIsP1 = !!(match.winnerId && match.player1Id && match.winnerId === match.player1Id);
  const winnerIsP2 = !!(match.winnerId && match.player2Id && match.winnerId === match.player2Id);

  return (
    <Card className={`bg-white/5 border-white/10 ${match.isPlayerMatch ? "ring-1 ring-blue-500/40" : ""}`}>
      <CardContent className="p-3 space-y-2">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="text-xs text-white/60">
            Match <span className="font-mono text-white/80">{match.matchId.slice(0, 8)}</span>
            <span className="text-white/40"> • #{match.matchNumber}</span>
          </div>

          <Badge className={`border ${meta.cls}`}>
            <Icon className="h-3 w-3 mr-1" />
            {meta.label}
          </Badge>
        </div>

        {/* Players */}
        <div className="space-y-2">
          <div className={`rounded-lg border p-2 ${winnerIsP1 ? "border-green-500/30 bg-green-600/10" : "border-white/10 bg-black/10"}`}>
            <div className="text-sm text-white">
              {playerLabel(match.player1Id)}
              {winnerIsP1 ? <span className="ml-2 text-xs text-green-200">Winner</span> : null}
            </div>
          </div>

          <div className={`rounded-lg border p-2 ${winnerIsP2 ? "border-green-500/30 bg-green-600/10" : "border-white/10 bg-black/10"}`}>
            <div className="text-sm text-white">
              {playerLabel(match.player2Id)}
              {winnerIsP2 ? <span className="ml-2 text-xs text-green-200">Winner</span> : null}
            </div>
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-black/10 p-2 text-xs text-white/65">
          <div className="flex items-center gap-2">
            <Clock className="h-3 w-3" /> {fmtTime(match.scheduledStartAt)}
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3" /> {deskLabel(match)}
          </div>
        </div>

        {/* Path (winner advances) */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-xs text-white/70">
          {match.winnerAdvancesToMatchId ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-3 w-3" />
                Winner → <span className="font-mono">{match.winnerAdvancesToMatchId.slice(0, 8)}</span>
                {match.winnerAdvancesToSlot ? <span className="text-white/50">(Slot {match.winnerAdvancesToSlot})</span> : null}
              </div>
              {next ? (
                <div className="text-white/60">
                  Next: {playerLabel(next.player1Id)} vs {playerLabel(next.player2Id)}
                </div>
              ) : (
                <div className="text-white/50">Next match details not loaded</div>
              )}
            </div>
          ) : (
            <div className="text-white/55">Advancement mapping not available yet.</div>
          )}
        </div>

        {match.isPlayerMatch ? (
          <Badge variant="outline" className="border-blue-500/40 text-blue-200 bg-blue-600/10">
            📍 Your match (play at assigned desk)
          </Badge>
        ) : null}
      </CardContent>
    </Card>
  );
}
