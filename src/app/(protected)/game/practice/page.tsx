
'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, ArrowLeft, RotateCcw } from 'lucide-react';

export default function PlayPracticePage() {
  const { data: session } = useSession();
  const [aiDifficulty, setAiDifficulty] = useState(3);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const handleDifficultyChange = useCallback((level: number) => {
    setAiDifficulty(level);
  }, []);

  const difficultyLabels = ['', 'Beginner', 'Easy', 'Medium', 'Hard', 'Expert'];
  
  // Use the practice version of 8ball
  const iframeSrc = useMemo(() => {
    const params = new URLSearchParams({
      autostart: '1',
      mode: 'practice',
      ai: String(aiDifficulty),
    });
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
        allow="autoplay; fullscreen"
        allowFullScreen
        onLoad={handleIframeLoad}
      />
      
      {/* Top Controls */}
      <div className="absolute top-3 right-3 z-30 hidden items-center justify-between gap-3 sm:flex">
        {/* Back Button */}
        <Link href="/game">
          <Button 
            size="sm"
            className="bg-black/60 backdrop-blur-sm border-white/20 text-white hover:bg-black/80"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>

      
      </div>
    </div>
  );
}
