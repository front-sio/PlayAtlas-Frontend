'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trophy, Users, Clock, Target } from 'lucide-react';
import { generateColor, getInitials } from '@/lib/avatarUtils';

interface GameOverPanelProps {
  visible: boolean;
  winner: 'player1' | 'player2' | null;
  player1Name: string;
  player2Name: string;
  player1Avatar?: string;
  player2Avatar?: string;
  player1Score: number;
  player2Score: number;
  matchDuration?: string;
  onPlayAgain?: () => void;
  onBackToLobby?: () => void;
}

export default function GameOverPanel({
  visible,
  winner,
  player1Name,
  player2Name,
  player1Avatar,
  player2Avatar,
  player1Score,
  player2Score,
  matchDuration,
  onPlayAgain,
  onBackToLobby
}: GameOverPanelProps) {
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setShowPanel(true), 100);
      return () => clearTimeout(timer);
    } else {
      setShowPanel(false);
    }
  }, [visible]);

  if (!visible) return null;

  const getPlayerResult = (player: 'player1' | 'player2') => {
    return winner === player ? 'Winner' : 'Player';
  };

  const player1Initials = getInitials(player1Name);
  const player2Initials = getInitials(player2Name);
  const player1Color = generateColor(player1Name);
  const player2Color = generateColor(player2Name);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-500 ${
      showPanel ? 'opacity-100' : 'opacity-0'
    }`}>
      <div className={`w-full max-w-2xl mx-4 transform transition-all duration-500 ${
        showPanel ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
      }`}>
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="relative bg-gradient-to-r from-emerald-600 to-blue-600 p-6 text-center">
            <div className="absolute inset-0 bg-black/20"></div>
            <div className="relative">
              <Trophy className="w-12 h-12 mx-auto mb-2 text-yellow-300" />
              <h2 className="text-3xl font-bold text-white mb-1">Match Complete</h2>
              <p className="text-white/80">Two Player 8-Ball Pool</p>
            </div>
          </div>

          {/* Players Section */}
          <div className="p-6">
            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* Player 1 */}
              <div className={`relative p-4 rounded-2xl border-2 transition-all duration-300 ${
                winner === 'player1' 
                  ? 'border-emerald-400 bg-emerald-500/10' 
                  : 'border-white/10 bg-white/5'
              }`}>
                <div className="text-center">
                  {winner === 'player1' && (
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
                      <Trophy className="w-4 h-4 text-white" />
                    </div>
                  )}
                  
                  {/* Player Avatar */}
                  <div className="w-20 h-20 mx-auto mb-3 rounded-full overflow-hidden border-4 border-white/20">
                    {player1Avatar ? (
                      <img 
                        src={player1Avatar} 
                        alt={player1Name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-white text-xl font-semibold"
                        style={{ backgroundColor: player1Color }}
                      >
                        {player1Initials || <Users className="w-8 h-8 text-white" />}
                      </div>
                    )}
                  </div>
                  
                  <h3 className="text-lg font-semibold text-white mb-1">{player1Name}</h3>
                  <p className="text-sm text-white/60 mb-2">{getPlayerResult('player1')}</p>
                  
                  {/* Score */}
                  <div className="text-3xl font-bold text-white mb-1">{player1Score}</div>
                  <p className="text-xs text-white/50">balls potted</p>
                </div>
              </div>

              {/* Player 2 */}
              <div className={`relative p-4 rounded-2xl border-2 transition-all duration-300 ${
                winner === 'player2' 
                  ? 'border-emerald-400 bg-emerald-500/10' 
                  : 'border-white/10 bg-white/5'
              }`}>
                <div className="text-center">
                  {winner === 'player2' && (
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
                      <Trophy className="w-4 h-4 text-white" />
                    </div>
                  )}
                  
                  {/* Player Avatar */}
                  <div className="w-20 h-20 mx-auto mb-3 rounded-full overflow-hidden border-4 border-white/20">
                    {player2Avatar ? (
                      <img 
                        src={player2Avatar} 
                        alt={player2Name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-white text-xl font-semibold"
                        style={{ backgroundColor: player2Color }}
                      >
                        {player2Initials || <Users className="w-8 h-8 text-white" />}
                      </div>
                    )}
                  </div>
                  
                  <h3 className="text-lg font-semibold text-white mb-1">{player2Name}</h3>
                  <p className="text-sm text-white/60 mb-2">{getPlayerResult('player2')}</p>
                  
                  {/* Score */}
                  <div className="text-3xl font-bold text-white mb-1">{player2Score}</div>
                  <p className="text-xs text-white/50">balls potted</p>
                </div>
              </div>
            </div>

            {/* Match Stats */}
            {matchDuration && (
              <div className="flex items-center justify-center gap-4 mb-6 p-3 bg-white/5 rounded-xl">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-white/80">Duration: {matchDuration}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-white/80">Final Score: {player1Score}-{player2Score}</span>
                </div>
              </div>
            )}

            {/* Winner Announcement */}
            {winner && (
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full">
                  <Trophy className="w-5 h-5 text-white" />
                  <span className="text-white font-semibold">
                    {winner === 'player1' ? player1Name : player2Name} Wins!
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 justify-center">
              <Button
                onClick={onBackToLobby}
                variant="outline"
                className="bg-white/5 border-white/20 text-white hover:bg-white/10 hover:border-white/30"
              >
                Back to Lobby
              </Button>
              {onPlayAgain && (
                <Button
                  onClick={onPlayAgain}
                  className="bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 text-white border-0"
                >
                  Play Again
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
