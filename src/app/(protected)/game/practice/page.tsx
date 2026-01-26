
'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, ArrowLeft, RotateCcw, Plus, Minus } from 'lucide-react';

export default function PlayPracticePage() {
  const { data: session } = useSession();
  const [aiDifficulty, setAiDifficulty] = useState(50);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const handleDifficultyChange = useCallback((level: number) => {
    setAiDifficulty(Math.max(1, Math.min(50, level)));
  }, []);

  // Extended difficulty labels for levels 1-50
  const getDifficultyLabel = (level: number) => {
    if (level <= 5) return ['', 'Beginner', 'Easy', 'Medium', 'Hard', 'Expert'][level];
    if (level <= 10) return 'Advanced';
    if (level <= 20) return 'Professional';
    if (level <= 30) return 'Master';
    if (level <= 40) return 'Grand Master';
    return 'AI Champion';
  };
  
  // Use the practice version of 8ball with enhanced difficulty support
  const iframeSrc = useMemo(() => {
    // Check for debug mode from URL (client-only)
    const debugMode =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('debug') === '1';

    const params = new URLSearchParams({
      autostart: '1',
      mode: 'practice',
      ai: String(aiDifficulty),
      practiceLevel: String(aiDifficulty)
    });
    
    // Pass debug mode to the game
    if (debugMode) {
      params.set('debug', '1');
    }
    
    return `/8ball-practice/index.html?${params.toString()}`;
  }, [aiDifficulty]);

  // Send player data to iframe when it loads
  useEffect(() => {
    if (iframeLoaded && session?.user) {
      const iframe = document.querySelector('iframe');
      if (iframe?.contentWindow) {
        const playerData = {
          type: 'SET_PLAYER_DATA',
          data: {
            playerId: session.user.userId,
            playerName: session.user.username || `${session.user.firstName} ${session.user.lastName}`.trim(),
            token: session.accessToken,
            mode: 'practice'
          }
        };
        
        iframe.contentWindow.postMessage(playerData, window.location.origin);
      }
    }
  }, [iframeLoaded, session]);

  // Send AI level updates to iframe
  useEffect(() => {
    if (iframeLoaded) {
      const iframe = document.querySelector('iframe');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'UPDATE_AI_LEVEL',
          data: { level: aiDifficulty }
        }, window.location.origin);
      }
    }
  }, [aiDifficulty, iframeLoaded]);

  const handleIframeLoad = () => {
    setIframeLoaded(true);
  };

  const restartGame = () => {
    const iframe = document.querySelector('iframe');
    if (iframe?.contentWindow) {
      // Force restart by reloading iframe
      iframe.src = iframe.src;
    }
  };

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden sm:h-screen sm:w-full">
      <iframe
        key={iframeSrc}
        src={iframeSrc}
        title="8-ball practice"
        className="absolute inset-0 h-full w-full border-0"
        allow="autoplay; fullscreen; microphone"
        allowFullScreen
        onLoad={handleIframeLoad}
      />
    </div>
  );
}
