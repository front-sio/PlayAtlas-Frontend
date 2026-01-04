// frontend/src/lib/pool/engine.ts
/**
 * PoolGameEngine — Professional 8-ball pool physics
 * 
 * Based on billiards-next reference implementation with improvements
 * 
 * Key features:
 * - Accurate impulse-based collision physics
 * - Realistic spin mechanics (screw, english, curve)
 * - Proper cushion physics with spin transfer  
 * - Easy pocket entry with gravity pull
 * - Stable substep integration
 * - AI opponent with difficulty levels
 */

type GameMode = 'practice' | 'match';
type PlayerId = 'p1' | 'p2';
type TargetGroup = 'ANY' | 'SOLIDS' | 'STRIPES' | '8';

type EngineHud = {
  turn: PlayerId;
  p1Target: TargetGroup;
  p2Target: TargetGroup;
  message: string;
  winner: PlayerId | null;
  foul: boolean;
  shotNumber: number;
  ballInHand: boolean;
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
  shotPower: number;
  shotType: string;
  lastShotResult: string;
};

type EngineOptions = {
  mode: GameMode;
  onHud: (hud: EngineHud) => void;
  onShot?: (shot: ShotData) => void;
  onState?: (state: GameState) => void;
  localSide?: PlayerId;
};

type Pocket = { x: number; y: number; radius: number; kind?: 'corner' | 'side' | 'rightCorner' };

export type ShotData = {
  direction: { x: number; y: number };
  power: number;
};

export type GameState = {
  balls: Array<{
    id: number;
    pos: { x: number; y: number };
    vel: { x: number; y: number };
    active: boolean;
  }>;
  turn: 'p1' | 'p2';
  p1Target: TargetGroup;
  p2Target: TargetGroup;
  ballInHand: boolean;
  winner: 'p1' | 'p2' | null;
  foul: boolean;
  shotNumber: number;
  p1Score: number;
  p2Score: number;
  message: string;
};

// Vector2 class
class Vec2 {
  x: number;
  y: number;
  
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  
  clone() { return new Vec2(this.x, this.y); }
  add(v: Vec2) { this.x += v.x; this.y += v.y; return this; }
  sub(v: Vec2) { this.x -= v.x; this.y -= v.y; return this; }
  scale(s: number) { this.x *= s; this.y *= s; return this; }
  len() { return Math.hypot(this.x, this.y); }
  lenSq() { return this.x * this.x + this.y * this.y; }
  magnitude() { return this.len(); }
  
  normalize() {
    const l = this.len();
    if (l > 0.0001) {
      this.x /= l;
      this.y /= l;
    }
    return this;
  }
  
  dot(v: Vec2) { return this.x * v.x + this.y * v.y; }
  perp() { return new Vec2(-this.y, this.x); }
  getLeftNormal() { return new Vec2(-this.y, this.x); }
  getRightNormal() { return new Vec2(this.y, -this.x); }
  times(s: number) { return new Vec2(this.x * s, this.y * s); }
  plus(v: Vec2) { return new Vec2(this.x + v.x, this.y + v.y); }
  minus(v: Vec2) { return new Vec2(this.x - v.x, this.y - v.y); }
  
  static sub(a: Vec2, b: Vec2) { return new Vec2(a.x - b.x, a.y - b.y); }
  static add(a: Vec2, b: Vec2) { return new Vec2(a.x + b.x, a.y + b.y); }
}

type Ball = {
  id: number;
  pos: Vec2;
  vel: Vec2;
  active: boolean;
  radius: number;
  isCue?: boolean;
  
  // Advanced spin mechanics
  screw?: number;
  english?: number;
  ySpin?: number;
  grip?: number;
  deltaScrew?: { x: number; y: number };
  firstContact?: boolean;
  pocketPull?: { x: number; y: number; strength: number };
};

type ShotEvents = {
  firstContact: number | null;
  pocketed: Array<{ id: number; pocketIndex: number }>;
  cushionHits: Set<number>;
  cueScratch: boolean;
};

// Table configuration
const TABLE_WIDTH = 1600;
const TABLE_HEIGHT = 900;
const RAIL_MARGIN = 96;
const BALL_RADIUS = 24;
const POCKET_RADIUS = Math.round(BALL_RADIUS * 2.15);
const RIGHT_CORNER_POCKET_RADIUS = Math.round(POCKET_RADIUS * 1.08);
const RIGHT_CORNER_POCKET_INSET = 10;
const RIGHT_CORNER_POCKET_Y_NUDGE = 4;
const POCKET_SINK_FACTOR = 0.98;
const POCKET_PULL_FACTOR = 1.7;
const POCKET_PULL_STRENGTH = 0.5;
const POCKET_OFFSET = 24;
const POCKET_IMAGE_SCALE = 1.04;
const POCKET_IMAGE_OFFSET_Y = 0;

// Physics constants
const PHYSICS_TIMESTEP = 1 / 120;
const MAX_SUBSTEPS = 8;
const COLLISION_ITERATIONS = 3;

const MIN_SHOT_POWER = 50;
const MAX_SHOT_POWER = 1500;
const POWER_SCALE = 1.2;

const FRICTION_DECEL = 190;
const STOP_SPEED = 1.0;
const MIN_VELOCITY_CLAMP = 0.1;
const ROLLING_DAMPING = 0.08;
const MAX_BALL_SPEED = 3200;
const BALL_RESTITUTION = 0.97;
const CUSHION_RESTITUTION = 0.88;
const CUSHION_TANGENT_LOSS = 0.98;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function groupForBall(id: number): TargetGroup {
  if (id === 8) return '8';
  if (id >= 1 && id <= 7) return 'SOLIDS';
  if (id >= 9 && id <= 15) return 'STRIPES';
  return 'ANY';
}

export class PoolGameEngine {
  private mode: GameMode;
  private onHud: (hud: EngineHud) => void;
  private onShot?: (shot: ShotData) => void;
  private onState?: (state: GameState) => void;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rafId: number | null = null;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;

  private balls: Ball[] = [];
  private pockets: Pocket[] = [];
  private shotEvents: ShotEvents = {
    firstContact: null,
    pocketed: [],
    cushionHits: new Set<number>(),
    cueScratch: false
  };

  private turn: PlayerId = 'p1';
  private p1Target: TargetGroup = 'ANY';
  private p2Target: TargetGroup = 'ANY';
  private shotNumber = 0;
  private shotRunning = false;
  private ballInHand = false;
  private winner: PlayerId | null = null;
  private foul = false;
  private message = 'Break rack';
  private localSide: PlayerId = 'p1';
  private lastShotOrigin: 'local' | 'remote' | 'ai' | null = null;

  private isAiming = false;
  private isPlacingCue = false;
  private aimDir = new Vec2(1, 0);
  private aimPower = 0;
  private aimPoint: Vec2 | null = null;
  private calledPocket: Pocket | null = null;
  private calledPocketFor: PlayerId | null = null;

  private aiDifficulty = 5;
  private aiThinking = false;
  private aiThinkStartTime = 0;
  private aiThinkDelay = 2000;
  private aiPlannedShot: { direction: Vec2; power: number } | null = null;

  private debugMode = false;
  private audioContext: AudioContext | null = null;
  private audioBuffers = new Map();
  private soundEnabled = true;
  private tableImage: HTMLImageElement | null = null;
  private pocketsImage: HTMLImageElement | null = null;
  private clothImage: HTMLImageElement | null = null;
  private cueImage: HTMLImageElement | null = null;
  private cueShadowImage: HTMLImageElement | null = null;
  private tableImageReady = false;
  private pocketsImageReady = false;
  private clothImageReady = false;
  private cueImageReady = false;
  private cueShadowReady = false;

  private p1Score = 0;
  private p2Score = 0;
  private gameStats = {
    totalShots: 0,
    p1ConsecutiveWins: 0,
    p2ConsecutiveWins: 0,
    longestRun: 0,
    currentRun: 0
  };

  private lastTime = 0;
  private accumulator = 0;

  constructor(options: EngineOptions) {
    this.mode = options.mode;
    this.onHud = options.onHud;
    this.onShot = options.onShot;
    this.onState = options.onState;
    if (options.localSide) {
      this.localSide = options.localSide;
    }
    this.setupTableGeometry();
    this.resetRack();
    this.initializeAudio().catch(() => {
      this.soundEnabled = false;
    });
  }

  async loadAssets() {
    if (typeof window === 'undefined') return;

    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load ${src}`));
        img.src = src;
      });

    try {
      const [tableTop, pockets, cloth, cue, cueShadow] = await Promise.all([
        loadImage('/pool/img/tableTop.png'),
        loadImage('/pool/img/pockets.png'),
        loadImage('/pool/img/cloth.png'),
        loadImage('/pool/img/cue.png'),
        loadImage('/pool/img/cueShadow.png')
      ]);
      this.tableImage = tableTop;
      this.pocketsImage = pockets;
      this.clothImage = cloth;
      this.cueImage = cue;
      this.cueShadowImage = cueShadow;
      this.tableImageReady = true;
      this.pocketsImageReady = true;
      this.clothImageReady = true;
      this.cueImageReady = true;
      this.cueShadowReady = true;
    } catch {
      this.tableImageReady = false;
      this.pocketsImageReady = false;
      this.clothImageReady = false;
      this.cueImageReady = false;
      this.cueShadowReady = false;
    }
  }

  bindCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    this.ctx = ctx;
    this.render();
  }

  resize(width: number, height: number, dpr: number) {
    if (!this.canvas || !this.ctx) return;
    
    this.dpr = clamp(dpr || window.devicePixelRatio || 1, 1, 3);
    this.cssWidth = width;
    this.cssHeight = height;
    
    const bufferW = Math.max(1, Math.floor(width * this.dpr));
    const bufferH = Math.max(1, Math.floor(height * this.dpr));
    
    this.canvas.width = bufferW;
    this.canvas.height = bufferH;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    
    const sx = (width * 0.96) / TABLE_WIDTH;
    const sy = (height * 0.96) / TABLE_HEIGHT;
    this.scale = Math.min(sx, sy);
    this.offsetX = (width - TABLE_WIDTH * this.scale) / 2;
    this.offsetY = (height - TABLE_HEIGHT * this.scale) / 2;
  }

  start() {
    this.lastTime = nowMs();
    
    const loop = () => {
      const ms = nowMs();
      const dtReal = Math.min((ms - this.lastTime) / 1000, 0.05);
      this.lastTime = ms;
      
      this.accumulator += dtReal;
      let steps = 0;
      
      while (this.accumulator >= PHYSICS_TIMESTEP && steps < MAX_SUBSTEPS) {
        this.step(PHYSICS_TIMESTEP);
        this.accumulator -= PHYSICS_TIMESTEP;
        steps++;
      }
      if (steps === MAX_SUBSTEPS) {
        this.accumulator = 0;
      }
      
      this.render();
      this.rafId = requestAnimationFrame(loop);
    };
    
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  screenToWorld(clientX: number, clientY: number, rect: DOMRect) {
    const x = (clientX - rect.left - this.offsetX) / this.scale;
    const y = (clientY - rect.top - this.offsetY) / this.scale;
    return { x, y };
  }

  onPointerDown(x: number, y: number) {
    if (this.winner) return;
    if (this.mode === 'practice' && this.turn === 'p2') return;
    if (this.mode === 'match' && this.turn !== this.localSide) return;
    
    const cue = this.balls[0];
    if (!cue) return;
    const playerTarget = this.turn === 'p1' ? this.p1Target : this.p2Target;
    if (!this.shotRunning && playerTarget === '8') {
      const pocket = this.getPocketAt(x, y);
      if (pocket) {
        this.calledPocket = pocket;
        this.calledPocketFor = this.turn;
        this.emitHud();
        return;
      }
    }

    if (this.ballInHand && this.turn === 'p1') {
      this.isPlacingCue = true;
      this.placeCueBall(x, y);
      this.emitHud();
      return;
    }

    if (!this.shotRunning) {
      this.isAiming = true;
      this.updateAim(x, y);
      this.emitHud();
    }
  }

  onPointerMove(x: number, y: number) {
    if (this.isPlacingCue) {
      this.placeCueBall(x, y);
      this.emitHud();
    }
    if (this.isAiming) {
      this.updateAim(x, y);
      this.emitHud();
    }
  }

  onPointerUp() {
    if (this.isPlacingCue) {
      this.isPlacingCue = false;
      this.ballInHand = false;
      this.emitHud();
      return;
    }
    
    if (this.isAiming) {
      this.isAiming = false;
      if (this.aimPower > MIN_SHOT_POWER) {
        this.takeShot('local');
      }
      this.aimPower = 0;
    }
  }

  setAiDifficulty(level: number) {
    this.aiDifficulty = clamp(level, 1, 5);
  }

  setDebugMode(enabled: boolean) {
    this.debugMode = enabled;
  }

  setLocalSide(side: PlayerId) {
    this.localSide = side;
  }

  applyRemoteShot(shot: ShotData) {
    if (this.winner) return;
    this.aimDir = new Vec2(shot.direction.x, shot.direction.y).normalize();
    this.aimPower = shot.power;
    this.takeShot('remote');
  }

  getState(): GameState {
    return {
      balls: this.balls.map((b) => ({
        id: b.id,
        pos: { x: b.pos.x, y: b.pos.y },
        vel: { x: b.vel.x, y: b.vel.y },
        active: b.active
      })),
      turn: this.turn,
      p1Target: this.p1Target,
      p2Target: this.p2Target,
      ballInHand: this.ballInHand,
      winner: this.winner,
      foul: this.foul,
      shotNumber: this.shotNumber,
      p1Score: this.p1Score,
      p2Score: this.p2Score,
      message: this.message
    };
  }

  applyState(state: GameState) {
    this.turn = state.turn;
    this.p1Target = state.p1Target;
    this.p2Target = state.p2Target;
    this.ballInHand = state.ballInHand;
    this.winner = state.winner;
    this.foul = state.foul;
    this.shotNumber = state.shotNumber;
    this.p1Score = state.p1Score;
    this.p2Score = state.p2Score;
    this.message = state.message || '';
    this.shotRunning = false;
    this.aiThinking = false;
    this.lastShotOrigin = null;
    this.shotEvents = {
      firstContact: null,
      pocketed: [],
      cushionHits: new Set<number>(),
      cueScratch: false
    };

    for (const saved of state.balls) {
      const ball = this.balls.find((b) => b.id === saved.id);
      if (!ball) continue;
      ball.active = saved.active;
      ball.pos.x = saved.pos.x;
      ball.pos.y = saved.pos.y;
      ball.vel.x = saved.vel.x;
      ball.vel.y = saved.vel.y;
    }

    this.emitHud();
  }

  resetGame() {
    this.p1Score = 0;
    this.p2Score = 0;
    this.gameStats.currentRun = 0;
    this.winner = null;
    this.foul = false;
    this.resetRack();
  }

  /* ========== AI System ========== */

  private startAiTurn() {
    if (this.mode !== 'practice' || this.turn !== 'p2' || this.winner) return;
    
    this.aiThinking = true;
    this.aiThinkStartTime = nowMs();
    this.message = 'AI thinking...';
    this.aiPlannedShot = null;
    if (!this.ballInHand) {
      const planned = this.calculateAiShot();
      if (planned) {
        this.aiPlannedShot = planned;
        this.aimDir = planned.direction;
        this.aimPower = planned.power;
      }
    }
    this.emitHud();
    
    const thinkTime = this.aiThinkDelay * (1 - (this.aiDifficulty - 1) * 0.15);
    setTimeout(() => {
      this.aiThinking = false;
      this.executeAiShot();
    }, thinkTime);
  }

  private executeAiShot() {
    if (this.winner || this.turn !== 'p2') return;

    if (this.ballInHand) {
      this.aiPlaceCueBall();
      return;
    }

    const cue = this.balls[0];
    if (!cue || !cue.active) {
      return;
    }

    const shot = this.aiPlannedShot || this.calculateAiShot();
    this.aiPlannedShot = null;
    if (shot) {
      this.aimDir = shot.direction;
      this.aimPower = shot.power;
      this.takeShot('ai');
    } else {
      this.aiRandomShot();
    }
  }

  private aiPlaceCueBall() {
    const cue = this.balls[0];
    if (!cue) return;

    const bestPos = this.findAiCuePosition();
    
    if (bestPos) {
      cue.pos.x = bestPos.x;
      cue.pos.y = bestPos.y;
      cue.vel.x = 0;
      cue.vel.y = 0;
      
      this.ballInHand = false;
      
      setTimeout(() => {
        this.executeAiShot();
      }, 500);
    }
  }

  private calculateAiShot() {
    const cue = this.balls[0];
    if (!cue) return null;

    const profile = this.getAiProfile();

    const targetBalls = this.getLegalTargetBalls('p2');
    if (targetBalls.length === 0) {
      const eightBall = this.balls.find(b => b.id === 8 && b.active);
      if (eightBall) {
        return this.calculateShotToBall(eightBall);
      }
      return null;
    }

    if (profile.missChance > 0 && Math.random() < profile.missChance) {
      return null;
    }

    const shots: Array<{ shot: { direction: Vec2; power: number }; score: number }> = [];

    for (const ball of targetBalls) {
      for (const pocket of this.pockets) {
        const score = this.evaluatePocketShotWithCuePos(cue.pos, ball, pocket);
        if (!Number.isFinite(score)) continue;
        const shot = this.calculateShotToPocket(ball, pocket, cue.pos);
        if (!shot) continue;
        shots.push({ shot, score });
      }
    }

    if (shots.length === 0) return null;

    const noiseScale = profile.noiseScale;
    for (const entry of shots) {
      entry.score += Math.random() * noiseScale;
    }

    shots.sort((a, b) => a.score - b.score);

    if (profile.selectionRange <= 1) {
      return shots[0].shot;
    }

    const selectionRange = Math.max(1, Math.min(profile.selectionRange, shots.length));
    const selectedIndex = Math.floor(Math.random() * selectionRange);
    return shots[selectedIndex].shot;
  }

  private calculateShotToBall(targetBall: Ball) {
    const cue = this.balls[0];
    if (!cue) return null;

    let bestPocket: Pocket | null = null;
    let bestScore = Infinity;

    for (const pocket of this.pockets) {
      const score = this.evaluatePocketShot(cue, targetBall, pocket);
      if (score < bestScore) {
        bestScore = score;
        bestPocket = pocket;
      }
    }

    if (!bestPocket) return null;

    return this.calculateShotToPocket(targetBall, bestPocket, cue.pos);
  }

  private calculateShotToPocket(targetBall: Ball, pocket: Pocket, cuePos: Vec2) {
    const ballToPocket = Vec2.sub(new Vec2(pocket.x, pocket.y), targetBall.pos).normalize();
    const ghostPos = targetBall.pos.minus(ballToPocket.times(BALL_RADIUS * 2));
    const aimDir = Vec2.sub(ghostPos, cuePos).normalize();

    const distToTarget = Vec2.sub(ghostPos, cuePos).len();
    const targetToPocket = Vec2.sub(new Vec2(pocket.x, pocket.y), targetBall.pos).len();
    const basePower = distToTarget * 1.7 + targetToPocket * 1.2;
    const power = Math.min(MAX_SHOT_POWER, Math.max(MIN_SHOT_POWER * 3.2, basePower));

    return {
      direction: this.applyAiError(aimDir),
      power: this.applyAiPowerError(power)
    };
  }

  private evaluatePocketShot(cue: Ball, target: Ball, pocket: Pocket): number {
    return this.evaluatePocketShotWithCuePos(cue.pos, target, pocket);
  }

  private evaluatePocketShotWithCuePos(cuePos: Vec2, target: Ball, pocket: Pocket): number {
    const profile = this.getAiProfile();
    let score = 0;

    const cueToTarget = Vec2.sub(target.pos, cuePos).len();
    score += cueToTarget * 0.5;

    const targetToPocket = Vec2.sub(new Vec2(pocket.x, pocket.y), target.pos).len();
    score += targetToPocket * 0.3;

    const hasObstruction = this.checkForObstructionFrom(cuePos, target, pocket);
    if (hasObstruction && profile.requireClearShot) {
      return Infinity;
    }
    score += hasObstruction ? 1200 : 0;

    const ballToPocket = Vec2.sub(new Vec2(pocket.x, pocket.y), target.pos);
    const cueToBall = Vec2.sub(target.pos, cuePos);
    const angle = Math.abs(this.angleBetween(ballToPocket, cueToBall));
    score += angle * 2;

    const isCornerPocket = pocket.x === RAIL_MARGIN || pocket.x === TABLE_WIDTH - RAIL_MARGIN;
    if (!isCornerPocket) score += 20;

    const maxCut = 1.25;
    if (angle > maxCut) {
      score += (angle - maxCut) * (profile.cutPenaltyHigh ? 700 : 350);
    }

    // Avoid cue-ball scratch: penalize lines pointing toward a pocket
    const aimDir = Vec2.sub(target.pos, cuePos).normalize();
    for (const pk of this.pockets) {
      const toPocket = Vec2.sub(new Vec2(pk.x, pk.y), cuePos);
      const forward = toPocket.dot(aimDir);
      if (forward <= 0) continue;
      const proj = aimDir.times(forward);
      const dist = Vec2.sub(toPocket, proj).len();
      if (dist < pk.radius * 0.9) {
        const riskPenalty = 220 + profile.riskPenalty;
        score += riskPenalty;
      }
    }

    return score;
  }

  private checkForObstruction(cue: Ball, target: Ball, pocket: Pocket): boolean {
    return this.checkForObstructionFrom(cue.pos, target, pocket);
  }

  private checkForObstructionFrom(cuePos: Vec2, target: Ball, pocket: Pocket): boolean {
    const ballToPocket = Vec2.sub(new Vec2(pocket.x, pocket.y), target.pos).normalize();
    const ghostPos = target.pos.minus(ballToPocket.times(BALL_RADIUS * 2));

    if (this.isLineBlocked(cuePos, ghostPos, new Set([0, target.id]), BALL_RADIUS * 2.4)) {
      return true;
    }

    if (this.isLineBlocked(target.pos, new Vec2(pocket.x, pocket.y), new Set([target.id]), BALL_RADIUS * 2.2)) {
      return true;
    }

    return false;
  }

  private isLineBlocked(start: Vec2, end: Vec2, ignoreIds: Set<number>, clearance: number): boolean {
    const line = Vec2.sub(end, start);
    const lenSq = line.lenSq();
    if (lenSq < 0.0001) return true;

    for (const b of this.balls) {
      if (!b.active || ignoreIds.has(b.id)) continue;
      const toBall = Vec2.sub(b.pos, start);
      const projection = toBall.dot(line) / lenSq;
      if (projection <= 0 || projection >= 1) continue;
      const closest = line.times(projection);
      const dist = Vec2.sub(toBall, closest).len();
      if (dist < clearance) return true;
    }

    return false;
  }

  private angleBetween(v1: Vec2, v2: Vec2): number {
    const angle = Math.atan2(v1.x * v2.y - v1.y * v2.x, v1.x * v2.x + v1.y * v2.y);
    return Math.abs(angle);
  }

  private getLegalTargetBalls(player: PlayerId): Ball[] {
    const targetGroup = player === 'p1' ? this.p1Target : this.p2Target;
    const targets: Ball[] = [];

    if (targetGroup === 'ANY') {
      for (const b of this.balls) {
        if (b.active && b.id !== 0 && b.id !== 8) {
          targets.push(b);
        }
      }
    } else if (targetGroup === '8') {
      const eight = this.balls.find(b => b.id === 8 && b.active);
      if (eight) targets.push(eight);
    } else {
      for (const b of this.balls) {
        if (b.active && groupForBall(b.id) === targetGroup) {
          targets.push(b);
        }
      }
    }

    return targets;
  }

  private evaluateShotDifficulty(ball: Ball): number {
    const cue = this.balls[0];
    if (!cue) return Infinity;

    let minScore = Infinity;
    for (const pocket of this.pockets) {
      const score = this.evaluatePocketShot(cue, ball, pocket);
      if (score < minScore) minScore = score;
    }

    return minScore;
  }

  private findAiCuePosition(): Vec2 | null {
    const targetBalls = this.getLegalTargetBalls('p2');
    if (targetBalls.length === 0) return null;

    if (this.aiDifficulty >= 4) {
      const candidates: Vec2[] = [];
      const bounds = {
        left: RAIL_MARGIN + BALL_RADIUS * 2,
        right: TABLE_WIDTH - RAIL_MARGIN - BALL_RADIUS * 2,
        top: RAIL_MARGIN + BALL_RADIUS * 2,
        bottom: TABLE_HEIGHT - RAIL_MARGIN - BALL_RADIUS * 2
      };

      candidates.push(new Vec2(TABLE_WIDTH * 0.25, TABLE_HEIGHT / 2));
      for (let i = 0; i < 24; i++) {
        const x = bounds.left + Math.random() * (bounds.right - bounds.left);
        const y = bounds.top + Math.random() * (bounds.bottom - bounds.top);
        const pos = new Vec2(x, y);
        if (this.isCuePositionValid(pos)) {
          candidates.push(pos);
        }
      }

      let bestPos: Vec2 | null = null;
      let bestScore = Infinity;

      for (const pos of candidates) {
        let localBest = Infinity;
        for (const ball of targetBalls) {
          for (const pocket of this.pockets) {
            const score = this.evaluatePocketShotWithCuePos(pos, ball, pocket);
            if (score < localBest) localBest = score;
          }
        }
        if (localBest < bestScore) {
          bestScore = localBest;
          bestPos = pos;
        }
      }

      if (bestPos) return bestPos;
    }

    let bestTarget = targetBalls[0];
    let bestScore = Infinity;

    for (const ball of targetBalls) {
      const score = this.evaluateShotDifficulty(ball);
      if (score < bestScore) {
        bestScore = score;
        bestTarget = ball;
      }
    }

    const targetX = bestTarget.pos.x;
    const targetY = bestTarget.pos.y;
    
    const centerX = TABLE_WIDTH / 2;
    const centerY = TABLE_HEIGHT / 2;
    const toCenter = Vec2.sub(new Vec2(centerX, centerY), bestTarget.pos).normalize();
    
    const cueX = targetX - toCenter.x * (BALL_RADIUS * 4);
    const cueY = targetY - toCenter.y * (BALL_RADIUS * 4);

    const x = clamp(cueX, RAIL_MARGIN + BALL_RADIUS * 2, TABLE_WIDTH - RAIL_MARGIN - BALL_RADIUS * 2);
    const y = clamp(cueY, RAIL_MARGIN + BALL_RADIUS * 2, TABLE_HEIGHT - RAIL_MARGIN - BALL_RADIUS * 2);

    return new Vec2(x, y);
  }

  private isCuePositionValid(pos: Vec2): boolean {
    for (const pk of this.pockets) {
      const dist = Math.hypot(pos.x - pk.x, pos.y - pk.y);
      if (dist < pk.radius * 1.2) return false;
    }

    for (let i = 1; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (!b.active) continue;
      const dist = Vec2.sub(b.pos, pos).len();
      if (dist < (BALL_RADIUS + b.radius) * 1.05) {
        return false;
      }
    }

    return true;
  }

  private aiRandomShot() {
    const cue = this.balls[0];
    if (!cue) return;

    const activeBalls = this.balls.filter(b => b.active && b.id !== 0);
    if (activeBalls.length === 0) return;

    const target = activeBalls[Math.floor(Math.random() * activeBalls.length)];
    
    const dir = Vec2.sub(target.pos, cue.pos).normalize();
    
    const aimDir = this.applyAiError(dir);
    const power = MIN_SHOT_POWER * 2.6 + Math.random() * (MAX_SHOT_POWER - MIN_SHOT_POWER) * 0.9;
    
    this.aimDir = aimDir;
    this.aimPower = power;
    this.takeShot('ai');
  }

  private applyAiError(dir: Vec2): Vec2 {
    const profile = this.getAiProfile();
    const errorDegrees = profile.errorDegrees;
    const errorRadians = errorDegrees * (Math.PI / 180);
    
    const angle = Math.atan2(dir.y, dir.x);
    const randomAngle = angle + (Math.random() - 0.5) * errorRadians;
    
    return new Vec2(Math.cos(randomAngle), Math.sin(randomAngle));
  }

  private applyAiPowerError(power: number): number {
    const profile = this.getAiProfile();
    const errorPercent = profile.powerError;
    const error = (Math.random() - 0.5) * 2 * errorPercent;
    
    return power * (1 + error);
  }

  private getAiProfile() {
    const level = clamp(this.aiDifficulty, 1, 5);
    const profiles = [
      { errorDegrees: 1.6, powerError: 0.03, noiseScale: 2.4, selectionRange: 2, missChance: 0.01, requireClearShot: true, cutPenaltyHigh: false, riskPenalty: 60 },
      { errorDegrees: 1.3, powerError: 0.025, noiseScale: 1.8, selectionRange: 2, missChance: 0.01, requireClearShot: true, cutPenaltyHigh: false, riskPenalty: 80 },
      { errorDegrees: 1.0, powerError: 0.02, noiseScale: 1.2, selectionRange: 1, missChance: 0, requireClearShot: true, cutPenaltyHigh: true, riskPenalty: 100 },
      { errorDegrees: 0.7, powerError: 0.016, noiseScale: 0.9, selectionRange: 1, missChance: 0, requireClearShot: true, cutPenaltyHigh: true, riskPenalty: 120 },
      { errorDegrees: 0.45, powerError: 0.012, noiseScale: 0.6, selectionRange: 1, missChance: 0, requireClearShot: true, cutPenaltyHigh: true, riskPenalty: 140 }
    ];

    return profiles[level - 1];
  }

  /* ========== Table & Rack ========== */

  private setupTableGeometry() {
    const left = RAIL_MARGIN - POCKET_OFFSET;
    const right = TABLE_WIDTH - RAIL_MARGIN + POCKET_OFFSET;
    const top = RAIL_MARGIN - POCKET_OFFSET;
    const bottom = TABLE_HEIGHT - RAIL_MARGIN + POCKET_OFFSET;
    const midX = TABLE_WIDTH / 2;
    const rightX = right - RIGHT_CORNER_POCKET_INSET;
    const rightTopY = top + RIGHT_CORNER_POCKET_Y_NUDGE;
    const rightBottomY = bottom - RIGHT_CORNER_POCKET_Y_NUDGE;
    
    this.pockets = [
      { x: left, y: top, radius: POCKET_RADIUS, kind: 'corner' },
      { x: midX, y: top, radius: POCKET_RADIUS, kind: 'side' },
      { x: rightX, y: rightTopY, radius: RIGHT_CORNER_POCKET_RADIUS, kind: 'rightCorner' },
      { x: left, y: bottom, radius: POCKET_RADIUS, kind: 'corner' },
      { x: midX, y: bottom, radius: POCKET_RADIUS, kind: 'side' },
      { x: rightX, y: rightBottomY, radius: RIGHT_CORNER_POCKET_RADIUS, kind: 'rightCorner' }
    ];
  }

  private resetRack() {
    this.balls = [];
    
    const cue: Ball = {
      id: 0,
      pos: new Vec2(TABLE_WIDTH * 0.25, TABLE_HEIGHT / 2),
      vel: new Vec2(),
      active: true,
      radius: BALL_RADIUS,
      isCue: true,
      screw: 0,
      english: 0,
      ySpin: 0,
      grip: 1,
      deltaScrew: { x: 0, y: 0 },
      firstContact: false
    };
    this.balls.push(cue);

    const rackX = TABLE_WIDTH * 0.72;
    const rackY = TABLE_HEIGHT / 2;
    const gap = BALL_RADIUS * 2 - 1.2;
    const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
    
    let idx = 0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        const x = rackX + row * gap * 0.87;
        const y = rackY - row * gap * 0.5 + col * gap;
        const id = order[idx++]!;
        
        this.balls.push({
          id,
          pos: new Vec2(x, y),
          vel: new Vec2(),
          active: true,
          radius: BALL_RADIUS,
          isCue: false,
          ySpin: 0,
          grip: 1,
          firstContact: false
        });
      }
    }

    this.turn = 'p1';
    this.p1Target = 'ANY';
    this.p2Target = 'ANY';
    this.ballInHand = false;
    this.shotNumber = 0;
    this.shotRunning = false;
    this.winner = null;
    this.foul = false;
    this.message = 'Break rack';
    this.lastShotOrigin = null;
    this.shotEvents = {
      firstContact: null,
      pocketed: [],
      cushionHits: new Set<number>(),
      cueScratch: false
    };
    this.calledPocket = null;
    this.calledPocketFor = null;
    
    this.emitHud();
  }

  /* ========== Physics Simulation ========== */

  private step(dt: number) {
    if (this.shotRunning || this.anyBallMoving()) {
      let maxSpeed = 0;
      for (const b of this.balls) {
        if (!b.active) continue;
        const speed = b.vel.len();
        if (speed > maxSpeed) maxSpeed = speed;
      }

      for (const b of this.balls) {
        if (!b.active) continue;
        
        if (b.deltaScrew && (Math.abs(b.deltaScrew.x) > 0.01 || Math.abs(b.deltaScrew.y) > 0.01)) {
          b.vel.x += b.deltaScrew.x;
          b.vel.y += b.deltaScrew.y;
          
          b.deltaScrew.x *= 0.8;
          b.deltaScrew.y *= 0.8;
          
          if (Math.abs(b.deltaScrew.x) < 1 && Math.abs(b.deltaScrew.y) < 1) {
            b.deltaScrew = { x: 0, y: 0 };
          }
        }
      }

      for (const b of this.balls) {
        if (!b.active) continue;
        b.pos.x += b.vel.x * dt;
        b.pos.y += b.vel.y * dt;
      }

      for (const b of this.balls) {
        if (!b.active) continue;
        
        const speed = b.vel.len();
        if (speed > MAX_BALL_SPEED) {
          const scale = MAX_BALL_SPEED / speed;
          b.vel.x *= scale;
          b.vel.y *= scale;
        }
        if (speed > 0) {
          const dec = FRICTION_DECEL * dt;
          const newSpeed = Math.max(0, speed - dec);
          
          if (newSpeed < STOP_SPEED) {
            b.vel.x = 0;
            b.vel.y = 0;
          } else {
            const s = newSpeed / speed;
            b.vel.x *= s;
            b.vel.y *= s;
          }
        }

        if (speed > STOP_SPEED) {
          const damp = Math.max(0, 1 - ROLLING_DAMPING * dt);
          b.vel.x *= damp;
          b.vel.y *= damp;
        }

        if (b.grip !== undefined && b.grip < 1) {
          b.grip += 0.02;
          if (b.grip > 1) b.grip = 1;
        }

        if (b.ySpin !== undefined) {
          if (b.ySpin >= 0.2) {
            b.ySpin -= 0.2;
          } else if (b.ySpin <= -0.2) {
            b.ySpin += 0.2;
          } else {
            b.ySpin = 0;
          }
        }

        if (b.ySpin !== undefined && b.ySpin !== 0 && speed > 0) {
          const vel = new Vec2(b.vel.x, b.vel.y);
          const leftNormal = vel.getLeftNormal();
          const mag = leftNormal.magnitude();
          
          if (mag > 0.0001) {
            const normalized = leftNormal.times(1 / mag);
            const curveForce = normalized.times(0.3 * b.ySpin * speed / 800);
            b.vel.x += curveForce.x;
            b.vel.y += curveForce.y;
          }
        }
      }

      const iterations = maxSpeed < 200 ? 1 : COLLISION_ITERATIONS;
      for (let it = 0; it < iterations; it++) {
        for (let i = 0; i < this.balls.length; i++) {
          const a = this.balls[i];
          if (!a.active) continue;
          
          for (let j = i + 1; j < this.balls.length; j++) {
            const b = this.balls[j];
            if (!b.active) continue;
            
            this.resolveBallCollision(a, b);
          }
        }
      }

      this.handleCushions();
      this.handlePockets();

      if (this.isAllBallsStopped()) {
        this.endShot();
      }
    }
  }

  private anyBallMoving(): boolean {
    for (const b of this.balls) {
      if (b.active && b.vel.len() > MIN_VELOCITY_CLAMP) {
        return true;
      }
    }
    return false;
  }

  private isAllBallsStopped(): boolean {
    for (const b of this.balls) {
      if (b.active && b.vel.len() > MIN_VELOCITY_CLAMP) {
        return false;
      }
    }
    return true;
  }

  private resolveBallCollision(a: Ball, b: Ball) {
    const nx = b.pos.x - a.pos.x;
    const ny = b.pos.y - a.pos.y;
    const distSq = nx * nx + ny * ny;
    const r = a.radius + b.radius;
    
    if (distSq === 0 || distSq > r * r) return;

    const dist = Math.sqrt(distSq) || 0.0001;
    const nux = nx / dist;
    const nuy = ny / dist;

    const overlap = r - dist;
    const percent = 0.95;
    const slop = 0.002;
    const correction = Math.max(overlap - slop, 0) * percent;
    const half = correction / 2;
    
    a.pos.x -= nux * half;
    a.pos.y -= nuy * half;
    b.pos.x += nux * half;
    b.pos.y += nuy * half;

    const rvx = b.vel.x - a.vel.x;
    const rvy = b.vel.y - a.vel.y;
    const velAlongNormal = rvx * nux + rvy * nuy;
    
    if (velAlongNormal > 0) return;

    if (this.shotEvents.firstContact === null) {
      if (a.isCue && !b.isCue) this.shotEvents.firstContact = b.id;
      else if (b.isCue && !a.isCue) this.shotEvents.firstContact = a.id;
    }

    const normal = new Vec2(nux, nuy);
    const tangent = normal.getRightNormal();

    const aVel = new Vec2(a.vel.x, a.vel.y);
    const bVel = new Vec2(b.vel.x, b.vel.y);

    const aNormal = normal.times(aVel.dot(normal));
    const aTangent = tangent.times(aVel.dot(tangent));
    const bNormal = normal.times(bVel.dot(normal));
    const bTangent = tangent.times(bVel.dot(tangent));

    if (a.isCue && Math.abs(a.ySpin ?? 0) < Math.abs(b.ySpin ?? 0)) {
      b.ySpin = -0.5 * (a.ySpin ?? 0);
    }
    if (b.isCue && Math.abs(b.ySpin ?? 0) < Math.abs(a.ySpin ?? 0)) {
      a.ySpin = -0.5 * (b.ySpin ?? 0);
    }

    if (a.isCue && !a.firstContact && a.screw !== undefined) {
      const aimDir = aNormal.times(1);
      if (!a.deltaScrew) a.deltaScrew = { x: 0, y: 0 };
      a.deltaScrew.x = aimDir.x * 0.17 * -a.screw;
      a.deltaScrew.y = aimDir.y * 0.17 * -a.screw;
      a.firstContact = true;
    }
    if (b.isCue && !b.firstContact && b.screw !== undefined) {
      const aimDir = bNormal.times(-1);
      if (!b.deltaScrew) b.deltaScrew = { x: 0, y: 0 };
      b.deltaScrew.x = aimDir.x * 0.17 * -b.screw;
      b.deltaScrew.y = aimDir.y * 0.17 * -b.screw;
      b.firstContact = true;
    }

    const impactSpeed = Math.abs(velAlongNormal);
    const ballRest = impactSpeed > 900 ? 0.92 : BALL_RESTITUTION;
    const newANormal = bNormal.times(ballRest).plus(aNormal.times(1 - ballRest));
    const newBNormal = aNormal.times(ballRest).plus(bNormal.times(1 - ballRest));

    const newAVel = aTangent.plus(newANormal);
    const newBVel = bTangent.plus(newBNormal);

    a.vel.x = newAVel.x;
    a.vel.y = newAVel.y;
    b.vel.x = newBVel.x;
    b.vel.y = newBVel.y;

    const collisionSpeed = newBVel.len();
    if (collisionSpeed > 450 && b.grip !== undefined) {
      b.grip = 0;
    }

    const tangentX = -nuy;
    const tangentY = nux;
    const velAlongTangent = rvx * tangentX + rvy * tangentY;
    const frictionCoeff = collisionSpeed > 800 ? 0.12 : 0.18;
    const j = -(1 + BALL_RESTITUTION) * velAlongNormal;
    const frictionImpulse = Math.min(
      Math.abs(velAlongTangent) * frictionCoeff,
      Math.abs(j) * 0.3
    );
    const frictionX = frictionImpulse * tangentX * Math.sign(velAlongTangent);
    const frictionY = frictionImpulse * tangentY * Math.sign(velAlongTangent);

    a.vel.x -= frictionX * 0.5;
    a.vel.y -= frictionY * 0.5;
    b.vel.x += frictionX * 0.5;
    b.vel.y += frictionY * 0.5;

    const impact = Math.abs(velAlongNormal);
    if (impact > 20) {
      this.playSound('ballHit', clamp(impact / 2000, 0.1, 1.0));
    }
  }

  private handleCushions() {
    const bounds = {
      left: RAIL_MARGIN,
      right: TABLE_WIDTH - RAIL_MARGIN,
      top: RAIL_MARGIN,
      bottom: TABLE_HEIGHT - RAIL_MARGIN
    };

    for (const b of this.balls) {
      if (!b.active) continue;

      const left = bounds.left + b.radius;
      const right = bounds.right - b.radius;
      const top = bounds.top + b.radius;
      const bottom = bounds.bottom - b.radius;

      let nearPocket = false;
      for (const pk of this.pockets) {
        const dx = b.pos.x - pk.x;
        const dy = b.pos.y - pk.y;
        const dist = Math.hypot(dx, dy);
        if (dist < pk.radius * 1.5) {
          nearPocket = true;
          break;
        }
      }

      if (nearPocket) continue;

      if (b.pos.x < left) {
        b.pos.x = left;
        const normalVel = new Vec2(b.vel.x, 0);
        const tangentVel = new Vec2(0, b.vel.y);

        if (b.isCue && b.english !== undefined) {
          const speed = b.vel.len();
          tangentVel.y += 0.2 * b.english * speed;
          b.english *= 0.5;
        }

        if (b.ySpin !== undefined) {
          b.ySpin += -tangentVel.y / 100;
          b.ySpin = clamp(b.ySpin, -50, 50);
        }

        if (b.deltaScrew) {
          b.deltaScrew.x *= 0.8;
          b.deltaScrew.y *= 0.8;
        }

        b.vel.x = Math.abs(normalVel.x) * CUSHION_RESTITUTION;
        b.vel.y = tangentVel.y * CUSHION_TANGENT_LOSS;
        
        this.shotEvents.cushionHits.add(b.id);
        this.playSound('cushionHit', clamp(Math.abs(normalVel.x) / 1000, 0.1, 1.0));
      }

      if (b.pos.x > right) {
        b.pos.x = right;
        const normalVel = new Vec2(b.vel.x, 0);
        const tangentVel = new Vec2(0, b.vel.y);

        if (b.isCue && b.english !== undefined) {
          const speed = b.vel.len();
          tangentVel.y += 0.2 * b.english * speed;
          b.english *= 0.5;
        }

        if (b.ySpin !== undefined) {
          b.ySpin += -tangentVel.y / 100;
          b.ySpin = clamp(b.ySpin, -50, 50);
        }

        if (b.deltaScrew) {
          b.deltaScrew.x *= 0.8;
          b.deltaScrew.y *= 0.8;
        }

        b.vel.x = -Math.abs(normalVel.x) * CUSHION_RESTITUTION;
        b.vel.y = tangentVel.y * CUSHION_TANGENT_LOSS;
        
        this.shotEvents.cushionHits.add(b.id);
        this.playSound('cushionHit', clamp(Math.abs(normalVel.x) / 1000, 0.1, 1.0));
      }

      if (b.pos.y < top) {
        b.pos.y = top;
        const normalVel = new Vec2(0, b.vel.y);
        const tangentVel = new Vec2(b.vel.x, 0);

        if (b.isCue && b.english !== undefined) {
          const speed = b.vel.len();
          tangentVel.x += 0.2 * b.english * speed;
          b.english *= 0.5;
        }

        if (b.ySpin !== undefined) {
          b.ySpin += -tangentVel.x / 100;
          b.ySpin = clamp(b.ySpin, -50, 50);
        }

        if (b.deltaScrew) {
          b.deltaScrew.x *= 0.8;
          b.deltaScrew.y *= 0.8;
        }

        b.vel.x = tangentVel.x * CUSHION_TANGENT_LOSS;
        b.vel.y = Math.abs(normalVel.y) * CUSHION_RESTITUTION;
        
        this.shotEvents.cushionHits.add(b.id);
        this.playSound('cushionHit', clamp(Math.abs(normalVel.y) / 1000, 0.1, 1.0));
      }

      if (b.pos.y > bottom) {
        b.pos.y = bottom;
        const normalVel = new Vec2(0, b.vel.y);
        const tangentVel = new Vec2(b.vel.x, 0);

        if (b.isCue && b.english !== undefined) {
          const speed = b.vel.len();
          tangentVel.x += 0.2 * b.english * speed;
          b.english *= 0.5;
        }

        if (b.ySpin !== undefined) {
          b.ySpin += -tangentVel.x / 100;
          b.ySpin = clamp(b.ySpin, -50, 50);
        }

        if (b.deltaScrew) {
          b.deltaScrew.x *= 0.8;
          b.deltaScrew.y *= 0.8;
        }

        b.vel.x = tangentVel.x * CUSHION_TANGENT_LOSS;
        b.vel.y = -Math.abs(normalVel.y) * CUSHION_RESTITUTION;
        
        this.shotEvents.cushionHits.add(b.id);
        this.playSound('cushionHit', clamp(Math.abs(normalVel.y) / 1000, 0.1, 1.0));
      }
    }
  }

  private handlePockets() {
    for (const b of this.balls) {
      if (!b.active) continue;

      let closestPocket: Pocket | null = null;
      let closestPocketIndex = -1;
      let minDist = Infinity;
      let isSunk = false;

      for (let i = 0; i < this.pockets.length; i++) {
        const pk = this.pockets[i]!;
        const dx = b.pos.x - pk.x;
        const dy = b.pos.y - pk.y;
        const dist = Math.hypot(dx, dy);
        const sinkFactor = pk.kind === 'rightCorner' ? POCKET_SINK_FACTOR * 1.05 : POCKET_SINK_FACTOR;

        if (dist < minDist) {
          minDist = dist;
          closestPocket = pk;
          closestPocketIndex = i;
        }

        if (dist <= pk.radius * sinkFactor) {
          isSunk = true;
          break;
        }
      }

      if (isSunk && closestPocket) {
        b.active = false;
        b.vel.x = 0;
        b.vel.y = 0;
        b.pos.x = closestPocket.x;
        b.pos.y = closestPocket.y;

        if (b.isCue) {
          this.shotEvents.cueScratch = true;
        } else {
          this.shotEvents.pocketed.push({ id: b.id, pocketIndex: Math.max(0, closestPocketIndex) });
        }

        this.playSound('pocketHit', 0.8);
        continue;
      }

      if (closestPocket) {
        const pullFactor =
          closestPocket.kind === 'rightCorner'
            ? POCKET_PULL_FACTOR * 1.08
            : POCKET_PULL_FACTOR;
        const pullStrengthBase =
          closestPocket.kind === 'rightCorner'
            ? POCKET_PULL_STRENGTH + 0.12
            : POCKET_PULL_STRENGTH;
        const pullRadius = closestPocket.radius * pullFactor;
        const pullThreshold = closestPocket.kind === 'rightCorner' ? 1.22 : 1.15;

        if (minDist <= pullRadius) {
          const pullStrength = (1 - minDist / pullRadius) * pullStrengthBase;
          const dx = closestPocket.x - b.pos.x;
          const dy = closestPocket.y - b.pos.y;
          const dist = Math.hypot(dx, dy);

          if (dist > 0) {
            const speed = b.vel.len();
            const force = pullStrength * (10 + Math.min(16, speed / 40));
            b.vel.x += (dx / dist) * force;
            b.vel.y += (dy / dist) * force;
          }

          if (minDist <= closestPocket.radius * pullThreshold) {
            b.pocketPull = {
              x: closestPocket.x,
              y: closestPocket.y,
              strength: 1 - minDist / (closestPocket.radius * (pullThreshold + 0.08))
            };
          }
        } else {
          b.pocketPull = undefined;
        }
      } else {
        b.pocketPull = undefined;
      }
    }

    if (this.shotEvents.cueScratch) {
      const cue = this.balls[0];
      if (cue) {
        cue.active = true;
        cue.pos.x = TABLE_WIDTH * 0.25;
        cue.pos.y = TABLE_HEIGHT / 2;
        cue.vel.x = 0;
        cue.vel.y = 0;
      }
    }
  }

  private endShot() {
    this.shotRunning = false;
    this.evaluateShot();
  }

  /* ========== Game Rules ========== */

  private evaluateShot() {
    const events = this.shotEvents;
    const currentPlayer = this.turn;
    const opponent: PlayerId = currentPlayer === 'p1' ? 'p2' : 'p1';
    const playerTarget = currentPlayer === 'p1' ? this.p1Target : this.p2Target;
    const pocketedIds = events.pocketed.map((entry) => entry.id);

    let foul = false;
    let message = '';
    let continueTurn = false;

    this.gameStats.totalShots++;
    this.shotNumber++;

    if (events.firstContact === null && events.pocketed.length === 0) {
      foul = true;
      message = 'No ball contacted';
    }

    if (events.cueScratch) {
      foul = true;
      message = 'Cue ball scratched';
    }

    if (!foul && playerTarget === 'ANY' && events.firstContact === 8) {
      foul = true;
      message = '8-ball contacted before groups assigned';
    }

    if (!foul && playerTarget !== 'ANY' && playerTarget !== '8' && events.firstContact !== null) {
      const contactGroup = groupForBall(events.firstContact);
      if (contactGroup !== playerTarget) {
        foul = true;
        message = 'Wrong ball contacted first';
      }
    }

    if (!foul && playerTarget === '8' && events.firstContact !== 8) {
      foul = true;
      message = 'Must hit 8-ball first';
    }

    if (!foul && playerTarget === 'ANY' && events.pocketed.length > 0) {
      const solids = pocketedIds.filter(id => id >= 1 && id <= 7);
      const stripes = pocketedIds.filter(id => id >= 9 && id <= 15);

      if (solids.length > 0 && stripes.length === 0) {
        this.assignGroups('SOLIDS');
        message = `${currentPlayer === 'p1' ? 'You' : 'Opponent'} assigned SOLIDS`;
      } else if (stripes.length > 0 && solids.length === 0) {
        this.assignGroups('STRIPES');
        message = `${currentPlayer === 'p1' ? 'You' : 'Opponent'} assigned STRIPES`;
      } else if (solids.length > 0 && stripes.length > 0) {
        const firstGroup = groupForBall(events.pocketed[0]!.id);
        if (firstGroup === 'SOLIDS' || firstGroup === 'STRIPES') {
          this.assignGroups(firstGroup);
          message = `${currentPlayer === 'p1' ? 'You' : 'Opponent'} assigned ${firstGroup}`;
        }
      }
    }

    if (!foul && events.pocketed.length > 0) {
      const legal = this.countLegalBalls(pocketedIds, playerTarget);
      if (legal > 0) {
        continueTurn = true;
        if (currentPlayer === 'p1') {
          this.p1Score += legal;
        } else {
          this.p2Score += legal;
        }
      }
    }

    if (!foul && playerTarget !== 'ANY' && playerTarget !== '8') {
      const remaining = this.getPlayerBallsRemaining(currentPlayer);
      if (remaining === 0) {
        if (currentPlayer === 'p1') this.p1Target = '8';
        else this.p2Target = '8';
      }
    }

    if (pocketedIds.includes(8)) {
      const remaining = this.getPlayerBallsRemaining(currentPlayer);
      const eightEntry = events.pocketed.find((entry) => entry.id === 8);
      const calledPocketIndex =
        this.calledPocketFor === currentPlayer && this.calledPocket
          ? this.pockets.indexOf(this.calledPocket)
          : -1;
      const mustCallPocket = playerTarget === '8' && remaining === 0;
      const calledPocketMiss =
        mustCallPocket &&
        calledPocketIndex >= 0 &&
        eightEntry &&
        eightEntry.pocketIndex !== calledPocketIndex;
      const calledPocketMissing = mustCallPocket && calledPocketIndex < 0;

      if (mustCallPocket && !foul && !calledPocketMiss && !calledPocketMissing) {
        this.winner = currentPlayer;
        message = `${currentPlayer === 'p1' ? 'You' : 'Opponent'} win!`;
        this.playSound('cheer', 1.0);
      } else {
        this.winner = opponent;
        foul = true;
        message = calledPocketMissing
          ? '8-ball pocketed without calling a pocket - opponent wins'
          : calledPocketMiss
          ? '8-ball pocketed in wrong pocket - opponent wins'
          : '8-ball pocketed illegally - opponent wins';
      }
    }

    if (this.winner) {
      this.ballInHand = false;
      this.gameStats.currentRun = 0;
      this.calledPocket = null;
      this.calledPocketFor = null;
    } else if (foul) {
      this.foul = true;
      this.turn = opponent;
      this.ballInHand = true;
      this.gameStats.currentRun = 0;
      this.calledPocket = null;
      this.calledPocketFor = null;
    } else if (continueTurn) {
      this.ballInHand = false;
      const newTarget = this.turn === 'p1' ? this.p1Target : this.p2Target;
      if (newTarget !== '8') {
        this.calledPocket = null;
        this.calledPocketFor = null;
      }
    } else {
      this.turn = opponent;
      this.ballInHand = false;
      this.gameStats.currentRun = 0;
      this.calledPocket = null;
      this.calledPocketFor = null;
    }

    this.shotEvents = {
      firstContact: null,
      pocketed: [],
      cushionHits: new Set<number>(),
      cueScratch: false
    };

    this.message = message;
    this.emitHud();

    if (this.mode === 'match' && this.lastShotOrigin === 'local' && this.onState) {
      this.onState(this.getState());
    }

    this.lastShotOrigin = null;

    if (!this.winner) {
      setTimeout(() => {
        this.triggerAiTurn();
      }, 100);
    }
  }

  private triggerAiTurn() {
    if (this.mode === 'practice' && this.turn === 'p2' && !this.aiThinking) {
      this.startAiTurn();
    }
  }

  private assignGroups(winnerGets: 'SOLIDS' | 'STRIPES') {
    if (this.turn === 'p1') {
      this.p1Target = winnerGets;
      this.p2Target = winnerGets === 'SOLIDS' ? 'STRIPES' : 'SOLIDS';
    } else {
      this.p2Target = winnerGets;
      this.p1Target = winnerGets === 'SOLIDS' ? 'STRIPES' : 'SOLIDS';
    }
  }

  private countLegalBalls(pocketed: number[], target: TargetGroup) {
    if (target === 'ANY') {
      return pocketed.filter(id => id !== 8).length;
    }
    return pocketed.filter(id => groupForBall(id) === target).length;
  }

  private getPlayerBallsRemaining(player: PlayerId) {
    const target = player === 'p1' ? this.p1Target : this.p2Target;
    if (target === 'SOLIDS') {
      return this.balls.filter(b => b.active && b.id >= 1 && b.id <= 7).length;
    }
    if (target === 'STRIPES') {
      return this.balls.filter(b => b.active && b.id >= 9 && b.id <= 15).length;
    }
    return this.balls.filter(b => b.active && b.id !== 0 && b.id !== 8).length;
  }

  /* ========== Input & Shooting ========== */

  private updateAim(x: number, y: number) {
    const cue = this.balls[0];
    if (!cue) return;

    this.aimPoint = new Vec2(x, y);
    const dir = Vec2.sub(cue.pos, new Vec2(x, y));
    const dist = dir.len();
    if (dist === 0) return;

    this.aimDir = dir.clone().normalize();
    const normalized = clamp(dist / 200, 0, 1);
    this.aimPower = MIN_SHOT_POWER + Math.pow(normalized, 1.5) * (MAX_SHOT_POWER - MIN_SHOT_POWER);
  }

  private getPocketAt(x: number, y: number) {
    for (const pk of this.pockets) {
      const dist = Math.hypot(x - pk.x, y - pk.y);
      if (dist <= pk.radius * 1.05) {
        return pk;
      }
    }
    return null;
  }

  private takeShot(origin: 'local' | 'remote' | 'ai' = 'local') {
    const cue = this.balls[0];
    if (!cue) return;

    if (origin === 'local' && this.mode === 'match' && this.onShot) {
      this.onShot({
        direction: { x: this.aimDir.x, y: this.aimDir.y },
        power: this.aimPower
      });
    }

    this.lastShotOrigin = origin;

    const velocityScale = this.aimPower * POWER_SCALE * 1.8;
    cue.vel.x = this.aimDir.x * velocityScale;
    cue.vel.y = this.aimDir.y * velocityScale;

    const spinAmount = Math.min(20, (this.aimPower / MAX_SHOT_POWER) * 18);
    cue.screw = 0;
    cue.english = 0;
    cue.ySpin = spinAmount * 0.3;
    cue.firstContact = false;
    cue.grip = 1;

    this.resumeAudioContext();
    this.playSound('cueHit', clamp(velocityScale / 1200, 0.3, 1.0));

    this.shotRunning = true;
    this.shotNumber++;
    this.ballInHand = false;
    this.emitHud();
  }

  private placeCueBall(x: number, y: number) {
    const cue = this.balls[0];
    if (!cue) return false;

    const bounds = {
      left: RAIL_MARGIN + cue.radius + 6,
      right: TABLE_WIDTH - RAIL_MARGIN - cue.radius - 6,
      top: RAIL_MARGIN + cue.radius + 6,
      bottom: TABLE_HEIGHT - RAIL_MARGIN - cue.radius - 6
    };

    const pos = new Vec2(
      clamp(x, bounds.left, bounds.right),
      clamp(y, bounds.top, bounds.bottom)
    );

    for (const pk of this.pockets) {
      const dist = Math.hypot(pos.x - pk.x, pos.y - pk.y);
      if (dist < pk.radius * 1.2) {
        const away = Vec2.sub(pos, new Vec2(pk.x, pk.y)).normalize().scale(pk.radius * 1.3);
        pos.x = pk.x + away.x;
        pos.y = pk.y + away.y;
      }
    }

    let canPlace = true;
    for (let i = 1; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (!b.active) continue;
      const dist = Vec2.sub(b.pos, pos).len();
      if (dist < (cue.radius + b.radius) * 1.05) {
        canPlace = false;
        break;
      }
    }

    if (canPlace) {
      cue.pos.x = pos.x;
      cue.pos.y = pos.y;
      cue.vel.x = 0;
      cue.vel.y = 0;
      return true;
    }

    return false;
  }

  /* ========== Rendering ========== */

  private render() {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    this.drawTable(ctx);

    if (this.pocketsImageReady && this.pocketsImage) {
      const w = TABLE_WIDTH * POCKET_IMAGE_SCALE;
      const h = TABLE_HEIGHT * POCKET_IMAGE_SCALE;
      const offsetX = (TABLE_WIDTH - w) / 2;
      const offsetY = (TABLE_HEIGHT - h) / 2 + POCKET_IMAGE_OFFSET_Y;
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.drawImage(this.pocketsImage, offsetX, offsetY, w, h);
      ctx.restore();
    } else {
      for (const pk of this.pockets) {
        this.drawPocket(ctx, pk);
      }
    }

    this.drawRails(ctx);
    
    this.drawCalledPocketOverlay(ctx);
    this.drawAimAssist(ctx);

    for (const b of this.balls) {
      if (b.active) {
        this.drawBall(ctx, b);
      }
    }

    this.drawCue(ctx);

    if (this.debugMode) {
      this.drawDebug(ctx);
    }

    ctx.restore();
  }

  private drawTable(ctx: CanvasRenderingContext2D) {
    const w = TABLE_WIDTH;
    const h = TABLE_HEIGHT;

    if (this.clothImageReady && this.clothImage) {
      ctx.drawImage(this.clothImage, 0, 0, w, h);
    } else {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      grad.addColorStop(0, '#2b6b32');
      grad.addColorStop(1, '#123a22');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    if (this.tableImageReady && this.tableImage) {
      ctx.drawImage(this.tableImage, 0, 0, w, h);
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 6;
      ctx.strokeRect(RAIL_MARGIN - 10, RAIL_MARGIN - 10, w - (RAIL_MARGIN - 10) * 2, h - (RAIL_MARGIN - 10) * 2);
    }
  }

  private drawPocket(ctx: CanvasRenderingContext2D, pk: Pocket) {
    if (this.pocketsImageReady && this.pocketsImage) {
      return;
    }
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = '#000';
    ctx.arc(pk.x, pk.y, pk.radius * 0.86, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawRails(ctx: CanvasRenderingContext2D) {
    if (this.tableImageReady && this.tableImage) return;

    ctx.save();
    ctx.fillStyle = '#6b3f22';

    ctx.fillRect(0, 0, TABLE_WIDTH, RAIL_MARGIN - 20);
    ctx.fillRect(0, TABLE_HEIGHT - (RAIL_MARGIN - 20), TABLE_WIDTH, RAIL_MARGIN - 20);
    ctx.fillRect(0, 0, RAIL_MARGIN - 20, TABLE_HEIGHT);
    ctx.fillRect(TABLE_WIDTH - (RAIL_MARGIN - 20), 0, RAIL_MARGIN - 20, TABLE_HEIGHT);

    ctx.restore();
  }

  private drawCue(ctx: CanvasRenderingContext2D) {
    if (!this.cueImageReady || !this.cueImage) return;
    if (this.shotRunning || this.ballInHand) return;
    if (this.mode === 'match' && this.turn !== this.localSide) return;

    const cue = this.balls[0];
    if (!cue || !cue.active) return;

    const angle = Math.atan2(this.aimDir.y, this.aimDir.x);
    const width = this.cueImage.width || 865;
    const height = this.cueImage.height || 23;
    const tipOffset = BALL_RADIUS * 0.85;
    let pull = clamp((this.aimPower - MIN_SHOT_POWER) / (MAX_SHOT_POWER - MIN_SHOT_POWER), 0, 1);
    if (this.mode === 'practice' && this.turn === 'p2' && this.aiThinking) {
      const progress = clamp((nowMs() - this.aiThinkStartTime) / this.aiThinkDelay, 0, 1);
      pull = Math.max(pull, progress);
    }
    const pullDistance = 160 * pull;
    const cueX = -width - tipOffset - pullDistance;
    const cueY = -height / 2;

    ctx.save();
    ctx.translate(cue.pos.x, cue.pos.y);
    ctx.rotate(angle);

    if (this.cueShadowReady && this.cueShadowImage) {
      const sw = this.cueShadowImage.width || 882;
      const sh = this.cueShadowImage.height || 91;
      ctx.globalAlpha = 0.35;
      ctx.drawImage(this.cueShadowImage, cueX - 6, cueY + 8, sw, sh);
      ctx.globalAlpha = 1;
    }

    ctx.drawImage(this.cueImage, cueX, cueY, width, height);
    ctx.restore();
  }

  private findTargetBall(cue: Ball, aimDir: Vec2) {
    let bestBall: Ball | null = null;
    let bestT = Infinity;

    for (const b of this.balls) {
      if (!b.active || b.isCue) continue;
      const toBall = Vec2.sub(b.pos, cue.pos);
      const t = toBall.dot(aimDir);
      if (t <= 0) continue;
      const lenSq = toBall.lenSq();
      const dSq = lenSq - t * t;
      const radius = b.radius * 1.1;
      if (dSq <= radius * radius && t < bestT) {
        bestT = t;
        bestBall = b;
      }
    }

    return bestBall;
  }

  private selectPocketForBall(target: Ball, aimPoint: Vec2 | null) {
    let bestPocket: Pocket | null = null;
    let bestScore = Infinity;
    const targetVector = aimPoint ? Vec2.sub(aimPoint, target.pos) : null;
    const targetVectorLen = targetVector ? targetVector.len() : 0;

    for (const pk of this.pockets) {
      if (aimPoint && targetVector && targetVectorLen > 0) {
        const toPocket = Vec2.sub(new Vec2(pk.x, pk.y), target.pos);
        const angle = Math.abs(this.angleBetween(targetVector, toPocket));
        const dist = toPocket.len();
        const score = angle * 900 + dist * 0.08;
        if (score < bestScore) {
          bestScore = score;
          bestPocket = pk;
        }
      } else {
        const dist = Math.hypot(target.pos.x - pk.x, target.pos.y - pk.y);
        if (dist < bestScore) {
          bestScore = dist;
          bestPocket = pk;
        }
      }
    }

    return bestPocket;
  }

  private drawAimAssist(ctx: CanvasRenderingContext2D) {
    if (!this.isAiming || this.shotRunning || this.ballInHand) return;
    if (this.mode === 'match' && this.turn !== this.localSide) return;

    const cue = this.balls[0];
    if (!cue || !cue.active) return;

    const targetBall = this.findTargetBall(cue, this.aimDir);
    const playerTarget = this.turn === 'p1' ? this.p1Target : this.p2Target;
    const aimPoint = this.aimPoint;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(235,245,255,0.75)';

    const contactPointFor = (ball: Ball) => {
      const toBall = Vec2.sub(ball.pos, cue.pos);
      const t = toBall.dot(this.aimDir);
      if (t <= 0) return null;
      const lenSq = toBall.lenSq();
      const dSq = lenSq - t * t;
      const r = ball.radius;
      if (dSq > r * r) return null;
      const offset = Math.sqrt(Math.max(0, r * r - dSq));
      const hitDist = t - offset;
      if (!Number.isFinite(hitDist)) return null;
      return new Vec2(cue.pos.x + this.aimDir.x * hitDist, cue.pos.y + this.aimDir.y * hitDist);
    };

    if (targetBall) {
      const contact = contactPointFor(targetBall);
      if (contact) {
        ctx.beginPath();
        ctx.moveTo(cue.pos.x, cue.pos.y);
        ctx.lineTo(contact.x, contact.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(contact.x, contact.y, targetBall.radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();

        const impactDir = Vec2.sub(targetBall.pos, contact).normalize();
        const angle = Math.acos(clamp(this.aimDir.dot(impactDir), -1, 1));
        const scale = clamp(1 - angle / (Math.PI / 2), 0, 1);
        const len = targetBall.radius * 5 * scale;
        const end = new Vec2(
          targetBall.pos.x + impactDir.x * len,
          targetBall.pos.y + impactDir.y * len
        );
        ctx.beginPath();
        ctx.moveTo(targetBall.pos.x, targetBall.pos.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    } else {
      const guideLen = 700;
      const end = new Vec2(cue.pos.x + this.aimDir.x * guideLen, cue.pos.y + this.aimDir.y * guideLen);
      ctx.beginPath();
      ctx.moveTo(cue.pos.x, cue.pos.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    if (targetBall) {
      const forcedPocket =
        playerTarget === '8' && this.calledPocketFor === this.turn ? this.calledPocket : null;
      if (forcedPocket && targetBall.id === 8) {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,160,80,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(forcedPocket.x, forcedPocket.y, forcedPocket.radius * 0.52, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawCalledPocketOverlay(ctx: CanvasRenderingContext2D) {
    if (this.shotRunning || this.ballInHand) return;
    if (this.mode === 'match' && this.turn !== this.localSide) return;
    if (this.calledPocketFor !== this.turn || !this.calledPocket) return;

    const playerTarget = this.turn === 'p1' ? this.p1Target : this.p2Target;
    if (playerTarget !== '8') return;

    const eight = this.balls.find((b) => b.id === 8 && b.active);
    if (!eight) return;

    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,160,80,0.75)';
    ctx.beginPath();
    ctx.moveTo(eight.pos.x, eight.pos.y);
    ctx.lineTo(this.calledPocket.x, this.calledPocket.y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,120,60,0.95)';
    ctx.beginPath();
    ctx.arc(this.calledPocket.x, this.calledPocket.y, this.calledPocket.radius * 0.58, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,215,140,0.9)';
    ctx.beginPath();
    ctx.arc(eight.pos.x, eight.pos.y, eight.radius * 1.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawBall(ctx: CanvasRenderingContext2D, b: Ball) {
    const x = b.pos.x;
    const y = b.pos.y;
    const r = b.radius;

    ctx.save();

    ctx.globalAlpha = 0.28;
    const sg = ctx.createRadialGradient(x + r * 0.22, y + r * 0.95, 0, x + r * 0.22, y + r * 0.95, r * 1.05);
    sg.addColorStop(0, 'rgba(0,0,0,0.45)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(x + r * 0.25, y + r * 1.1, r * 1.02, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const color = this.ballColor(b.id);
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r * 1.2);
    g.addColorStop(0, this.lighten(color, 30));
    g.addColorStop(0.4, color);
    g.addColorStop(1, this.darken(color, 30));
    
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    if (b.id > 0) {
      if (b.id >= 9) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = '#fff';
        const stripeHeight = r * 0.78;
        ctx.fillRect(x - r, y - stripeHeight / 2, r * 2, stripeHeight);
        ctx.restore();
      }

      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x, y - r * 0.08, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#000';
      ctx.font = `${r * 0.48}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${b.id}`, x, y - r * 0.08);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = 0.45;
    const hg = ctx.createRadialGradient(x - r * 0.36, y - r * 0.36, 0, x - r * 0.2, y - r * 0.2, r * 0.6);
    hg.addColorStop(0, 'rgba(255,255,255,0.95)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  private drawDebug(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    
    ctx.strokeRect(RAIL_MARGIN, RAIL_MARGIN, TABLE_WIDTH - RAIL_MARGIN * 2, TABLE_HEIGHT - RAIL_MARGIN * 2);
    
    for (const pk of this.pockets) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,0,0,0.4)';
      ctx.arc(pk.x, pk.y, pk.radius, 0, Math.PI * 2, false);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,0,0.2)';
      ctx.arc(pk.x, pk.y, pk.radius * 2.0, 0, Math.PI * 2, false);
      ctx.stroke();
    }
    
    ctx.restore();
  }

  /* ========== Audio ========== */

  private async initializeAudio() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const sounds = ['ballHit2', 'cushionHit', 'pocketHit', 'cueHit', 'cheer'];
      
      for (const s of sounds) {
        try {
          const resp = await fetch(`/pool/audio/${s}.wav`);
          if (!resp.ok) continue;
          const ab = await resp.arrayBuffer();
          const buf = await this.audioContext.decodeAudioData(ab);
          this.audioBuffers.set(s, buf);
        } catch {}
      }
    } catch {
      this.soundEnabled = false;
    }
  }

  private playSound(name: string, volume = 1) {
    if (!this.soundEnabled || !this.audioContext) return;
    
    const map: Record<string, string> = {
      ballHit: 'ballHit2',
      cushionHit: 'cushionHit',
      pocketHit: 'pocketHit',
      cueHit: 'cueHit',
      cheer: 'cheer'
    };
    
    const key = map[name] || name;
    const buf = this.audioBuffers.get(key);
    if (!buf) return;
    
    try {
      const src = this.audioContext.createBufferSource();
      const gain = this.audioContext.createGain();
      src.buffer = buf;
      src.connect(gain);
      gain.connect(this.audioContext.destination);
      gain.gain.value = clamp(volume, 0, 1);
      src.start();
    } catch {}
  }

  private resumeAudioContext() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }

  /* ========== Helpers ========== */

  private ballColor(id: number) {
    const solids = ['#FFFDF8', '#FFD34E', '#2563EB', '#EF4444', '#7C3AED', '#FB923C', '#10B981', '#7F1D1D', '#111111'];
    const stripes = ['#FFD34E', '#2563EB', '#EF4444', '#7C3AED', '#FB923C', '#10B981', '#7F1D1D'];
    
    if (id === 0) return solids[0];
    if (id <= 8) return solids[id];
    return stripes[id - 9];
  }

  private lighten(hex: string, amt: number) {
    try {
      const c = hex.replace('#', '');
      const r = clamp(parseInt(c.substring(0, 2), 16) + amt, 0, 255);
      const g = clamp(parseInt(c.substring(2, 4), 16) + amt, 0, 255);
      const b = clamp(parseInt(c.substring(4, 6), 16) + amt, 0, 255);
      return `rgb(${r}, ${g}, ${b})`;
    } catch {
      return hex;
    }
  }

  private darken(hex: string, amt: number) {
    return this.lighten(hex, -amt);
  }

  private emitHud() {
    try {
      this.onHud(this.getHud());
    } catch {}
  }

  getHud(): EngineHud {
    return {
      turn: this.turn,
      p1Target: this.p1Target,
      p2Target: this.p2Target,
      message: this.message,
      winner: this.winner,
      foul: this.foul,
      shotNumber: this.shotNumber,
      ballInHand: this.ballInHand,
      p1Score: this.p1Score,
      p2Score: this.p2Score,
      p1BallsRemaining: this.getPlayerBallsRemaining('p1'),
      p2BallsRemaining: this.getPlayerBallsRemaining('p2'),
      currentRun: this.gameStats.currentRun,
      gameStats: {
        totalShots: this.gameStats.totalShots,
        p1ConsecutiveWins: this.gameStats.p1ConsecutiveWins,
        p2ConsecutiveWins: this.gameStats.p2ConsecutiveWins,
        longestRun: this.gameStats.longestRun
      },
      shotPower: this.aimPower,
      shotType: this.shotNumber === 0 ? 'Break Setup' : 'Play',
      lastShotResult: ''
    };
  }
}
