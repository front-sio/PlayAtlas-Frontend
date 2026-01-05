'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { PoolGameEngine, GameState, ShotData } from '@/lib/pool/engine';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type PoolGameCanvasProps = {
  mode: 'practice' | 'match';
  aiDifficulty?: number;
  fullscreen?: boolean;
  showWinnerOverlay?: boolean;
  localSide?: 'p1' | 'p2';
  onEngineReady?: (engine: PoolGameEngine) => void;
  onShot?: (shot: ShotData) => void;
  onState?: (state: GameState) => void;
};

type Hud = {
  turn: 'p1' | 'p2';
  p1Target: 'ANY' | 'SOLIDS' | 'STRIPES' | '8';
  p2Target: 'ANY' | 'SOLIDS' | 'STRIPES' | '8';
  message: string;
  winner: 'p1' | 'p2' | null;
  foul: boolean;
  shotNumber: number;
  ballInHand: boolean;
  // Enhanced scoring information
  p1Score: number;
  p2Score: number;
  p1BallsRemaining: number;
  p2BallsRemaining: number;
  currentRun: number;
  gameStats: {
    totalShots: number;
    p1ConsecutiveWins: number;
    p2ConsecutiveWins: number;
    longestRun: number;
  };
  // Enhanced shot feedback
  shotPower: number;
  shotType: string;
  lastShotResult: string;
};

export function PoolGameCanvas({
  mode,
  aiDifficulty = 5,
  fullscreen = false,
  showWinnerOverlay = true,
  localSide,
  onEngineReady,
  onShot,
  onState
}: PoolGameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<PoolGameEngine | null>(null);
  const [hud, setHud] = useState<Hud | null>(null);
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [showFullscreenPrompt, setShowFullscreenPrompt] = useState(false);
  const [spin, setSpin] = useState({ x: 0, y: 0 });
  const { data: session } = useSession();
  const onShotRef = useRef<typeof onShot>(onShot);
  const onStateRef = useRef<typeof onState>(onState);
  const spinPadRef = useRef<HTMLDivElement | null>(null);
  const spinDragRef = useRef(false);

  // Get player name from session or fallback
  const playerName = session?.user?.username || 
                    session?.user?.firstName || 
                    session?.user?.email?.split('@')[0] || 
                    'Player 1';

  const heading = useMemo(() => {
    if (!hud) return 'Setting up table...';
    const side = localSide || 'p1';
    const isLocalTurn = hud.turn === side;
    if (hud.winner) {
      return hud.winner === side ? 'You Win!' : mode === 'practice' ? 'AI Wins!' : 'You Lose!';
    }
    
    if (hud.shotNumber === 0) {
      if (isLocalTurn) return 'Break the rack!';
      return mode === 'practice' ? 'AI breaks...' : 'Opponent breaks...';
    }
    
    return isLocalTurn ? 'Your turn' : mode === 'practice' ? 'AI thinking...' : 'Opponent\'s turn';
  }, [hud, mode, localSide]);

  const winnerLabel = useMemo(() => {
    if (!hud?.winner) return '';
    const side = localSide || 'p1';
    if (hud.winner === side) return 'You';
    return mode === 'practice' ? 'AI' : 'Opponent';
  }, [hud, mode, localSide]);

  const winnerMessage = useMemo(() => {
    if (!hud?.winner) return '';
    if (hud.message) return hud.message;
    return hud.winner === (localSide || 'p1')
      ? 'You win by pocketing the 8-ball.'
      : 'Opponent wins by pocketing the 8-ball.';
  }, [hud, localSide]);

  const spinDotRange = 28;

  const requestFullscreen = useCallback(() => {
    if (!fullscreen) return;
    const el = containerRef.current as HTMLElement | null;
    if (!el) return;
    const doc = document as Document & { fullscreenElement?: Element | null; webkitFullscreenElement?: Element | null };
    const isFullscreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
    if (isFullscreen) return;
    const request = (el as HTMLElement & { requestFullscreen?: () => Promise<void>; webkitRequestFullscreen?: () => Promise<void> })
      .requestFullscreen || (el as any).webkitRequestFullscreen;
    if (!request) return;
    try {
      const result = request.call(el);
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(() => undefined);
      }
    } catch {
      // Ignore fullscreen errors.
    }
  }, [fullscreen]);

  const updateSpin = useCallback((clientX: number, clientY: number) => {
    const pad = spinPadRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const dx = clientX - rect.left - rect.width / 2;
    const dy = clientY - rect.top - rect.height / 2;
    const radius = rect.width / 2 - 6;
    const dist = Math.hypot(dx, dy);
    const scale = dist > radius ? radius / dist : 1;
    const nx = (dx * scale) / radius;
    const ny = (dy * scale) / radius;
    const next = { x: nx, y: ny };
    setSpin(next);
    engineRef.current?.setSpin(next.x, -next.y);
  }, []);

  const resetSpin = useCallback(() => {
    setSpin({ x: 0, y: 0 });
    engineRef.current?.setSpin(0, 0);
  }, []);

  const onSpinPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    spinDragRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateSpin(event.clientX, event.clientY);
  }, [updateSpin]);

  const onSpinPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!spinDragRef.current) return;
    updateSpin(event.clientX, event.clientY);
  }, [updateSpin]);

  const onSpinPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    spinDragRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore pointer capture errors.
    }
  }, []);

  useEffect(() => {
    onShotRef.current = onShot;
  }, [onShot]);

  useEffect(() => {
    onStateRef.current = onState;
  }, [onState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const engine = new PoolGameEngine({
      mode,
      onHud: (nextHud) => setHud(nextHud),
      onShot: (shot) => onShotRef.current?.(shot),
      onState: (state) => onStateRef.current?.(state),
      localSide: localSide || 'p1'
    });
    engine.setAiDifficulty(aiDifficulty);
    engine.setSpin(0, 0);
    engineRef.current = engine;
    onEngineReady?.(engine);

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimeout: NodeJS.Timeout | null = null;
    let fullscreenChangeHandler: (() => void) | null = null;

    const handleResize = () => {
      if (cancelled) return;
      
      if (resizeTimeout) clearTimeout(resizeTimeout);
      
      resizeTimeout = setTimeout(() => {
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        if (rect.width > 0 && rect.height > 0) {
          engine.resize(rect.width, rect.height, dpr);
        }
        
        const isMobile = window.innerWidth < 768;
        const isPortrait = rect.width < rect.height;
        setIsMobilePortrait(isMobile && isPortrait);
      }, 100);
    };

    const onDown = (event: PointerEvent) => {
      if (cancelled) return;
      // Best-effort fullscreen on first user interaction.
      if (fullscreen) {
        const el = containerRef.current as HTMLElement | null;
        const doc = document as Document & { fullscreenElement?: Element | null; webkitFullscreenElement?: Element | null };
        const isFullscreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
        if (!isFullscreen && el) {
          const request = (el as HTMLElement & { requestFullscreen?: () => Promise<void>; webkitRequestFullscreen?: () => Promise<void> })
            .requestFullscreen || (el as any).webkitRequestFullscreen;
          if (request) {
            try {
              const result = request.call(el);
              if (result && typeof (result as Promise<void>).catch === 'function') {
                (result as Promise<void>).catch(() => undefined);
              }
              setShowFullscreenPrompt(false);
            } catch {
              // Ignore fullscreen errors.
            }
          }
        }
      }
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch (e) {
        // Ignore pointer capture errors
      }
      const rect = canvas.getBoundingClientRect();
      const pos = engine.screenToWorld(event.clientX, event.clientY, rect);
      engine.onPointerDown(pos.x, pos.y);
    };
    
    const onMove = (event: PointerEvent) => {
      if (cancelled) return;
      const rect = canvas.getBoundingClientRect();
      const pos = engine.screenToWorld(event.clientX, event.clientY, rect);
      engine.onPointerMove(pos.x, pos.y);
    };
    
    const onUp = (event: PointerEvent) => {
      if (cancelled) return;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch (e) {
        // Ignore pointer capture errors
      }
      engine.onPointerUp();
    };

    const requestInitialFullscreen = () => {
      if (!fullscreen) return;
      const el = containerRef.current as HTMLElement | null;
      if (!el) return;
      const doc = document as Document & { fullscreenElement?: Element | null; webkitFullscreenElement?: Element | null };
      const isFullscreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
      if (isFullscreen) return;
      const request = (el as HTMLElement & { requestFullscreen?: () => Promise<void>; webkitRequestFullscreen?: () => Promise<void> })
        .requestFullscreen || (el as any).webkitRequestFullscreen;
      if (!request) return;
      try {
        const result = request.call(el);
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch(() => {
            setShowFullscreenPrompt(true);
          });
          return;
        }
        setShowFullscreenPrompt(true);
      } catch {
        // Ignore fullscreen errors.
        setShowFullscreenPrompt(true);
      }
    };

    const start = async () => {
      try {
        await engine.loadAssets();
      } catch {
        // Asset loading failed, using fallback
      }
      if (cancelled) return;
      
      engine.bindCanvas(canvas);
      engine.start();
      
      handleResize();
      requestInitialFullscreen();
      
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
      
      window.addEventListener('orientationchange', handleResize);
      
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointerleave', onUp);
      
      // Debug mode toggle (press 'D' key)
      const handleKeyPress = (event: KeyboardEvent) => {
        if (event.key.toLowerCase() === 'd') {
          const currentDebug = (engine as any).debugMode || false;
          engine.setDebugMode(!currentDebug);
          console.log('Debug mode:', !currentDebug ? 'enabled' : 'disabled');
        }
      };
      
      document.addEventListener('keydown', handleKeyPress);

      fullscreenChangeHandler = () => {
        const doc = document as Document & { fullscreenElement?: Element | null; webkitFullscreenElement?: Element | null };
        const isFullscreen = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
        if (isFullscreen) {
          setShowFullscreenPrompt(false);
        }
      };

      document.addEventListener('fullscreenchange', fullscreenChangeHandler);
      document.addEventListener('webkitfullscreenchange', fullscreenChangeHandler);
    };

    start();

    return () => {
      cancelled = true;
      if (resizeTimeout) clearTimeout(resizeTimeout);
      engine.stop();
      engineRef.current = null;
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('orientationchange', handleResize);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onUp);
      if (fullscreenChangeHandler) {
        document.removeEventListener('fullscreenchange', fullscreenChangeHandler);
        document.removeEventListener('webkitfullscreenchange', fullscreenChangeHandler);
      }
      // Note: handleKeyPress cleanup handled by component unmount
    };
  }, [mode, aiDifficulty, localSide, onEngineReady]);

  useEffect(() => {
    if (engineRef.current && localSide) {
      engineRef.current.setLocalSide(localSide);
    }
  }, [localSide]);

  // Fullscreen version
  if (fullscreen) {
    return (
      <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-black flex flex-col">
        {/* Top Scoreboard - 8 Ball Pool style */}
        <div 
          className="absolute z-10 left-0 right-0 flex justify-between items-center px-3 py-2 md:py-1 bg-gradient-to-b from-black/70 to-transparent backdrop-blur-sm pointer-events-none"
          style={{
            top: `env(safe-area-inset-top)`,
            paddingTop: `calc(env(safe-area-inset-top) + 8px)`
          }}
        >
          {/* Player 1 (Left side - Authenticated user) */}
          <div className="flex items-center gap-2 md:gap-3 pointer-events-auto">
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-[10px] md:text-xs">
              P1
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-white font-semibold text-[10px] md:text-xs truncate max-w-[120px] md:max-w-[150px]">{playerName}</span>
              {hud && (
                <>
                  <div className="flex gap-1 mb-1">
                    {/* Ball progress indicators for Player 1 */}
                    {hud.p1Target === 'SOLIDS' && [1,2,3,4,5,6,7].map(n => (
                      <div key={n} className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-yellow-500 border border-white/30 text-[9px] md:text-[10px] text-black text-center leading-3 md:leading-3">{n}</div>
                    ))}
                    {hud.p1Target === 'STRIPES' && [9,10,11,12,13,14,15].map(n => (
                      <div key={n} className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-red-500 border border-white/30 text-[9px] md:text-[10px] text-white text-center leading-3 md:leading-3">{n}</div>
                    ))}
                    {hud.p1Target === 'ANY' && (
                      <span className="text-[10px] md:text-xs text-white/60">Open table</span>
                    )}
                  </div>
                  {/* Score display */}
                  <div className="flex gap-2 text-[9px] md:text-[10px] text-white/80">
                    <span>Pocketed: {hud.p1Score}</span>
                    {hud.p1Target !== 'ANY' && (
                      <span>Left: {hud.p1BallsRemaining}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Center - Game Status */}
          <div className="text-center pointer-events-none">
            <div className="text-white font-medium text-[10px] md:text-xs">{heading}</div>
            {hud?.message && !hud?.winner && (
              <div className="text-white/70 text-[9px] md:text-[10px]">{hud.message}</div>
            )}
            {hud?.ballInHand && (
              <span className="text-yellow-300 text-[9px] md:text-[10px]">Place cue ball</span>
            )}
            {hud?.foul && (
              <span className="text-red-300 text-[9px] md:text-[10px]">Foul committed</span>
            )}
            
            {/* Enhanced shot feedback */}
            {hud && hud.lastShotResult && (
              <div className={`text-[9px] md:text-[10px] ${
                hud.lastShotResult.includes('Great') || hud.lastShotResult.includes('Good') ? 'text-green-300' :
                hud.lastShotResult.includes('Foul') || hud.lastShotResult.includes('Illegal') ? 'text-red-300' :
                'text-blue-300'
              }`}>
                {hud.lastShotResult}
              </div>
            )}
            
            {hud && hud.shotType && hud.shotType !== 'Normal' && (
              <div className="text-orange-300 text-[8px] md:text-[9px]">
                {hud.shotType} • Power: {Math.round((hud.shotPower / 1200) * 100)}%
              </div>
            )}
            
            {hud && hud.currentRun > 0 && (
              <div className="text-green-300 text-[9px] md:text-[10px]">
                Current run: {hud.currentRun}
              </div>
            )}
            {hud && hud.gameStats.totalShots > 0 && (
              <div className="text-white/60 text-[8px] md:text-[9px]">
                Shots: {hud.gameStats.totalShots} • Best run: {hud.gameStats.longestRun}
              </div>
            )}
          </div>

          {/* Player 2 (Right side - AI or opponent) */}
          <div className="flex items-center gap-2 md:gap-3 flex-row-reverse pointer-events-auto">
            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white font-bold text-[10px] md:text-xs">
              {mode === 'practice' ? 'AI' : 'P2'}
            </div>
            <div className="flex flex-col items-end min-w-0">
              <span className="text-white font-semibold text-[10px] md:text-xs truncate max-w-[120px] md:max-w-[150px]">
                {mode === 'practice' ? 'AI' : 'Player 2'}
              </span>
              {hud && (
                <>
                  <div className="flex gap-1 mb-1">
                    {/* Ball progress indicators for Player 2 */}
                    {hud.p2Target === 'SOLIDS' && [1,2,3,4,5,6,7].map(n => (
                      <div key={n} className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-yellow-500 border border-white/30 text-[9px] md:text-[10px] text-black text-center leading-3 md:leading-3">{n}</div>
                    ))}
                    {hud.p2Target === 'STRIPES' && [9,10,11,12,13,14,15].map(n => (
                      <div key={n} className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-red-500 border border-white/30 text-[9px] md:text-[10px] text-white text-center leading-3 md:leading-3">{n}</div>
                    ))}
                    {hud.p2Target === 'ANY' && (
                      <span className="text-[10px] md:text-xs text-white/60">Open table</span>
                    )}
                  </div>
                  {/* Score display */}
                  <div className="flex gap-2 text-[9px] md:text-[10px] text-white/80">
                    <span>Pocketed: {hud.p2Score}</span>
                    {hud.p2Target !== 'ANY' && (
                      <span>Left: {hud.p2BallsRemaining}</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Canvas - properly sized to avoid HUD overlap */}
        <div
          ref={containerRef}
          className="pool-canvas-container absolute overflow-hidden"
        >
          <canvas 
            ref={canvasRef} 
            className="absolute inset-0 w-full h-full"
            style={{ 
              display: 'block',
              touchAction: 'none'
            }}
          />
          {isMobilePortrait && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm">
              <div className="text-center space-y-4">
                <div className="text-4xl">📱</div>
                <h3 className="text-lg font-semibold text-white">Rotate to landscape</h3>
                <p className="text-sm text-white/70 max-w-xs">
                  Turn your device sideways to play 8 Ball
                </p>
              </div>
            </div>
          )}
          {showFullscreenPrompt && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="text-center space-y-3 px-6">
                <div className="text-2xl">⛶</div>
                <p className="text-sm text-white/80">
                  Tap to enter fullscreen
                </p>
                <Button
                  onClick={requestFullscreen}
                  className="bg-white/90 text-black hover:bg-white"
                >
                  Go Fullscreen
                </Button>
              </div>
            </div>
          )}
        </div>

        {mode === 'match' && (
          <div className="absolute right-3 bottom-6 z-20 flex flex-col items-center gap-2 pointer-events-auto">
            <div className="text-[10px] text-white/70">Spin</div>
            <div
              ref={spinPadRef}
              onPointerDown={onSpinPointerDown}
              onPointerMove={onSpinPointerMove}
              onPointerUp={onSpinPointerUp}
              onPointerLeave={onSpinPointerUp}
              className="relative w-20 h-20 rounded-full bg-black/50 border border-white/15 backdrop-blur-sm"
              style={{ touchAction: 'none' }}
            >
              <div className="absolute inset-1 rounded-full border border-white/10" />
              <div
                className="absolute left-1/2 top-1/2 h-3 w-3 rounded-full bg-white/90 shadow"
                style={{
                  transform: `translate(-50%, -50%) translate(${spin.x * spinDotRange}px, ${spin.y * spinDotRange}px)`
                }}
              />
            </div>
            <Button
              size="sm"
              className="bg-white/10 text-white/80 border-white/15 hover:bg-white/20"
              onClick={resetSpin}
            >
              Reset
            </Button>
          </div>
        )}

        {/* Winner overlay */}
        {showWinnerOverlay && hud?.winner && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 backdrop-blur-sm z-20">
            <h2 className="text-2xl font-bold text-white">
              {hud.winner === (localSide || 'p1')
                ? 'You Win!'
                : mode === 'practice'
                ? 'AI Wins!'
                : 'You Lost'}
            </h2>
            <div className="text-sm text-white/80 text-center max-w-xs">
              {winnerMessage}
            </div>
            <div className="text-xs text-white/60">
              Score: {hud.p1Score} - {hud.p2Score}
            </div>
            <Button 
              onClick={() => window.location.reload()} 
              className="bg-gradient-to-r from-purple-600 to-pink-600 text-white"
            >
              Play Again
            </Button>
          </div>
        )}

        {mode === 'practice' && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20 pointer-events-none">
            <div className="rounded-full bg-black/40 backdrop-blur-sm border border-white/10 px-3 py-1.5 text-[10px] text-white/80">
              AI Level: {aiDifficulty}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Embedded version (dashboard)
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-white/70 pb-2">
        <div className="text-white font-medium text-xs sm:text-sm">{heading}</div>
        {hud && (
          <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-xs">
            <span className="rounded-full border border-white/20 px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs">
              P1: {hud.p1Target}
            </span>
            {mode === 'practice' && (
              <Badge  className="border-purple-400/30 text-purple-200 text-[10px] sm:text-xs px-1 sm:px-2">
                AI-{aiDifficulty}
              </Badge>
            )}
            <span className="rounded-full border border-white/20 px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs">
              {mode === 'practice' ? 'AI' : 'P2'}: {hud.p2Target}
            </span>
            {hud.ballInHand && <span className="text-amber-300 text-[10px] sm:text-xs">Ball in hand</span>}
            {hud.foul && <span className="text-red-300 text-[10px] sm:text-xs">Foul</span>}
          </div>
        )}
      </div>
      {hud && (
        <div className="flex flex-wrap items-center gap-2 text-[10px] sm:text-xs text-white/70 pb-2">
          <span>Score: {hud.p1Score} - {hud.p2Score}</span>
          {hud.p1Target !== 'ANY' && <span>P1 left: {hud.p1BallsRemaining}</span>}
          {hud.p2Target !== 'ANY' && <span>{mode === 'practice' ? 'AI' : 'P2'} left: {hud.p2BallsRemaining}</span>}
        </div>
      )}
      {hud?.message && (
        <div className="pb-1 sm:pb-2 text-[10px] sm:text-xs text-white/50">{hud.message}</div>
      )}
      <div
        ref={containerRef}
        className="relative flex-1 w-full rounded-lg overflow-hidden"
        style={{ 
          background: '#1a1a1a',
          minHeight: '300px',
          maxHeight: '85vh'
        }}
      >
        {mode === 'match' && (
          <div className="absolute right-3 bottom-3 z-20 flex flex-col items-center gap-2 pointer-events-auto">
            <div className="text-[10px] text-white/70">Spin</div>
            <div
              ref={spinPadRef}
              onPointerDown={onSpinPointerDown}
              onPointerMove={onSpinPointerMove}
              onPointerUp={onSpinPointerUp}
              onPointerLeave={onSpinPointerUp}
              className="relative w-16 h-16 rounded-full bg-black/50 border border-white/15 backdrop-blur-sm"
              style={{ touchAction: 'none' }}
            >
              <div className="absolute inset-1 rounded-full border border-white/10" />
              <div
                className="absolute left-1/2 top-1/2 h-3 w-3 rounded-full bg-white/90 shadow"
                style={{
                  transform: `translate(-50%, -50%) translate(${spin.x * spinDotRange}px, ${spin.y * spinDotRange}px)`
                }}
              />
            </div>
            <Button
              size="sm"
              className="bg-white/10 text-white/80 border-white/15 hover:bg-white/20"
              onClick={resetSpin}
            >
              Reset
            </Button>
          </div>
        )}
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full"
          style={{ 
            display: 'block',
            touchAction: 'none'
          }}
        />
        {isMobilePortrait && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 backdrop-blur-sm rounded-lg">
            <div className="text-center space-y-4">
              <div className="text-4xl">📱</div>
              <h3 className="text-lg font-semibold text-white">Rotate to landscape</h3>
              <p className="text-sm text-white/70 max-w-xs">
                Turn your device sideways to play 8 Ball
              </p>
            </div>
          </div>
        )}
      </div>
      {showWinnerOverlay && hud?.winner && (
        <div className="mt-2 sm:mt-4 flex gap-2">
          <div className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80">
            Winner: {winnerLabel} • {winnerMessage}
          </div>
          <Button 
            onClick={() => window.location.reload()} 
            className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-sm sm:text-base py-2 sm:py-3"
          >
            Play Again
          </Button>
        </div>
      )}
    </div>
  );
}
