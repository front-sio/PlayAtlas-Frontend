'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Brain, ArrowLeft } from 'lucide-react';
import { PoolGameCanvas } from '@/components/pool/PoolGameCanvas';

export default function PlayPracticePage() {
  const [aiDifficulty, setAiDifficulty] = useState(3);
  const [gameKey, setGameKey] = useState(0);

  const handleDifficultyChange = (level: number) => {
    setAiDifficulty(level);
    setGameKey(prev => prev + 1);
  };

  const difficultyLabels = ['', 'Beginner', 'Easy', 'Medium', 'Hard', 'Expert'];

  return (
    <div className="relative w-full h-full">
      {/* Game Canvas - Fullscreen */}
      <PoolGameCanvas key={gameKey} mode="practice" aiDifficulty={aiDifficulty} fullscreen />
      
      {/* Top Controls Overlay */}
      <div className="absolute top-[28%] left-3 right-3 z-30 flex items-center justify-between gap-3">
        {/* Back Button */}
        <Link href="/game">
          <Button 
             
            size="sm"
            className="bg-black/60 backdrop-blur-sm border-white/20 text-white hover:bg-black/80"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Lobby
          </Button>
        </Link>
      </div>

      {/* AI Difficulty Control - Right Side */}
      <div className="absolute right-2 top-[55%] -translate-y-1/2 z-30">
        <Card className="bg-black/55 backdrop-blur-sm border-white/15">
          <CardContent className="p-1.5 flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-2">
              <Brain className="h-3.5 w-3.5 text-purple-300" />
              <span className="text-[10px] text-white/80 font-medium">AI</span>
            </div>
            <div className="flex flex-col gap-1">
              {[5, 4, 3, 2, 1].map((level) => (
                <Button
                  key={level}
                  onClick={() => handleDifficultyChange(level)}
                  size="sm"
                  className={`w-7 h-7 p-0 ${
                    aiDifficulty === level
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-white/10 hover:bg-white/20 text-white/70 border-white/20'
                  }`}
                >
                  {level}
                </Button>
              ))}
            </div>
            <Badge className="border-white/15 text-white/80 text-[9px]">
              {difficultyLabels[aiDifficulty]}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Tips */}
      <div className="absolute bottom-2 right-3 z-30 pointer-events-none">
        <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1.5">
          <p className="text-[10px] text-white/70">
            Practice mode • No stats • Press D for debug
          </p>
        </div>
      </div>
    </div>
  );
}
