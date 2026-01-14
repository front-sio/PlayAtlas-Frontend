
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
  const [aiDifficulty, setAiDifficulty] = useState(5);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const handleDifficultyChange = useCallback((level: number) => {
    setAiDifficulty(Math.max(1, Math.min(110, level)));
  }, []);

  // Extended difficulty labels for levels 1-110
  const getDifficultyLabel = (level: number) => {
    if (level <= 5) return ['', 'Beginner', 'Easy', 'Medium', 'Hard', 'Expert'][level];
    if (level <= 10) return 'Advanced';
    if (level <= 20) return 'Professional';
    if (level <= 30) return 'Master';
    if (level <= 50) return 'Grand Master';
    if (level <= 70) return 'AI Champion';
    if (level <= 90) return 'AI Genius';
    if (level <= 100) return 'AI Overlord';
    return 'AI Supreme';
  };
  
  // Use the practice version of 8ball with enhanced difficulty support
  const iframeSrc = useMemo(() => {
    // Check for debug mode from URL
    const urlParams = new URLSearchParams(window?.location?.search || '');
    const debugMode = urlParams.get('debug') === '1';
    
    const params = new URLSearchParams({
      autostart: '1',
      mode: 'practice',
      ai: String(aiDifficulty),
      practiceLevel: String(aiDifficulty),
      aiBrainLevel: String(aiDifficulty),
      difficultyMode: aiDifficulty <= 100 ? 'practice' : 'aiBrain'
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
      {/* Game Controls Overlay */}
      <div className="absolute top-4 left-4 z-10 flex gap-2 flex-wrap">
        <Link href="/game">
          <Button variant="outline" size="sm" className="bg-white/90 backdrop-blur-sm hover:bg-white">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </Link>
        <Button
          variant="outline" 
          size="sm" 
          onClick={restartGame}
          className="bg-white/90 backdrop-blur-sm hover:bg-white"
        >
          <RotateCcw className="w-4 h-4 mr-1" />
          Restart
        </Button>
      </div>

      {/* AI Difficulty Controls */}
      <div className="absolute top-4 right-4 z-10">
        <Card className="bg-white/90 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Brain className="w-5 h-5 text-blue-600" />
              <div className="flex flex-col">
                <div className="text-sm font-medium">AI Difficulty</div>
                <Badge variant="outline" className="text-xs">
                  Level {aiDifficulty} - {getDifficultyLabel(aiDifficulty)}
                </Badge>
              </div>
            </div>
            
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDifficultyChange(aiDifficulty - 1)}
                disabled={aiDifficulty <= 1}
                className="h-8 w-8 p-0"
              >
                <Minus className="w-3 h-3" />
              </Button>
              
              <div className="flex-1 mx-2">
                <input
                  type="range"
                  min="1"
                  max="110"
                  value={aiDifficulty}
                  onChange={(e) => handleDifficultyChange(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1</span>
                  <span>110</span>
                </div>
              </div>
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDifficultyChange(aiDifficulty + 1)}
                disabled={aiDifficulty >= 110}
                className="h-8 w-8 p-0"
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>

            {/* Quick level buttons */}
            <div className="mt-3 flex gap-1 flex-wrap">
              {[1, 5, 10, 25, 50, 75, 100, 110].map(level => (
                <Button
                  key={level}
                  size="sm"
                  variant={aiDifficulty === level ? "default" : "outline"}
                  onClick={() => handleDifficultyChange(level)}
                  className="h-6 px-2 text-xs"
                >
                  {level}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      
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
