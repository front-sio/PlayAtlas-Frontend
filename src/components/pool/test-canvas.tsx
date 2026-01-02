'use client';

import { useEffect, useRef } from 'react';

export function TestCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvas.width = 800;
    canvas.height = 600;
    
    ctx.fillStyle = '#0a5738';
    ctx.fillRect(0, 0, 800, 600);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(400, 300, 30, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Canvas Test Working!', 400, 50);
    
    console.log('Test canvas rendered');
  }, []);
  
  return <canvas ref={canvasRef} className="w-full h-full" />;
}
