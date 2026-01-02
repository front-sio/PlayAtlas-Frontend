/**
 * Professional 8-Ball Billiards Rules Implementation
 * Based on World Pool-Billiard Association (WPA) Official Rules
 */

export type PlayerId = 'p1' | 'p2';
export type BallGroup = 'ANY' | 'SOLIDS' | 'STRIPES' | '8';
export type FoulType = 
  | 'NO_CONTACT'
  | 'SCRATCH' 
  | 'WRONG_BALL_FIRST'
  | 'NO_RAIL_AFTER_CONTACT'
  | 'BALL_OFF_TABLE'
  | 'DOUBLE_HIT'
  | 'PUSH_SHOT'
  | 'ILLEGAL_BREAK'
  | 'EIGHT_BALL_EARLY';

export interface ShotResult {
  firstContact: number | null;
  pocketed: number[];
  cushionHits: Set<number>;
  cueScratch: boolean;
  ballsOffTable: number[];
  railContactAfterFirstHit: boolean;
}

export interface GameState {
  turn: PlayerId;
  p1Target: BallGroup;
  p2Target: BallGroup;
  shotNumber: number;
  ballInHand: boolean;
  winner: PlayerId | null;
  foul: boolean;
  message: string;
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
    p1Fouls: number;
    p2Fouls: number;
  };
  lastShotResult: string;
  foulType: FoulType | null;
  breakComplete: boolean;
}

export class EightBallRules {
  private state: GameState;
  private activeBalls: Set<number>;

  constructor() {
    this.state = this.getInitialState();
    this.activeBalls = new Set(Array.from({ length: 16 }, (_, i) => i));
  }

  private getInitialState(): GameState {
    return {
      turn: 'p1',
      p1Target: 'ANY',
      p2Target: 'ANY',
      shotNumber: 0,
      ballInHand: false,
      winner: null,
      foul: false,
      message: 'Break the rack!',
      p1Score: 0,
      p2Score: 0,
      p1BallsRemaining: 7,
      p2BallsRemaining: 7,
      currentRun: 0,
      gameStats: {
        totalShots: 0,
        p1ConsecutiveWins: 0,
        p2ConsecutiveWins: 0,
        longestRun: 0,
        p1Fouls: 0,
        p2Fouls: 0,
      },
      lastShotResult: '',
      foulType: null,
      breakComplete: false,
    };
  }

  public getState(): GameState {
    return { ...this.state };
  }

  public setState(state: Partial<GameState>): void {
    this.state = { ...this.state, ...state };
  }

  public updateActiveBalls(activeBallIds: number[]): void {
    this.activeBalls = new Set(activeBallIds);
  }

  public resetGame(): void {
    this.state = this.getInitialState();
    this.activeBalls = new Set(Array.from({ length: 16 }, (_, i) => i));
  }

  /**
   * Evaluate shot based on 8-ball rules
   */
  public evaluateShot(shotResult: ShotResult): GameState {
    const { turn, p1Target, p2Target, shotNumber, breakComplete } = this.state;
    const opponent: PlayerId = turn === 'p1' ? 'p2' : 'p1';
    const playerTarget = turn === 'p1' ? p1Target : p2Target;

    // Update shot counter
    this.state.shotNumber++;
    this.state.gameStats.totalShots++;
    this.state.foul = false;
    this.state.foulType = null;
    this.state.lastShotResult = '';

    let continueTurn = false;
    let foulOccurred = false;
    let message = '';

    // Handle the break shot
    if (shotNumber === 0) {
      return this.evaluateBreak(shotResult);
    }

    // Check for fouls
    const foulCheck = this.checkForFouls(shotResult, playerTarget);
    if (foulCheck.isFoul) {
      foulOccurred = true;
      this.state.foul = true;
      this.state.foulType = foulCheck.foulType;
      message = foulCheck.message;
      
      // Track fouls
      if (turn === 'p1') {
        this.state.gameStats.p1Fouls++;
      } else {
        this.state.gameStats.p2Fouls++;
      }
    }

    // Handle 8-ball pocketing
    if (shotResult.pocketed.includes(8)) {
      return this.handle8BallPocket(shotResult, playerTarget, foulOccurred);
    }

    // Assign groups if still unassigned
    if (!foulOccurred && playerTarget === 'ANY' && shotResult.pocketed.length > 0 && breakComplete) {
      const assignment = this.assignGroups(shotResult.pocketed, turn);
      if (assignment.success) {
        message = assignment.message;
        this.state.lastShotResult = 'Group assigned';
      } else if (assignment.foul) {
        foulOccurred = true;
        this.state.foul = true;
        message = assignment.message;
      }
    }

    // Count legal balls pocketed
    if (!foulOccurred && shotResult.pocketed.length > 0) {
      const legalBalls = this.countLegalBalls(shotResult.pocketed, playerTarget);
      
      if (legalBalls > 0) {
        continueTurn = true;
        this.state.currentRun++;
        
        if (this.state.currentRun > this.state.gameStats.longestRun) {
          this.state.gameStats.longestRun = this.state.currentRun;
        }

        // Update score and track remaining balls
        if (turn === 'p1') {
          this.state.p1Score += legalBalls;
        } else {
          this.state.p2Score += legalBalls;
        }
        
        message = `${legalBalls} ball${legalBalls > 1 ? 's' : ''} pocketed`;
        this.state.lastShotResult = 'Legal pocket';

        // Check if player cleared their group
        const remaining = this.getPlayerBallsRemaining(turn);
        if (remaining === 0 && playerTarget !== 'ANY') {
          this.state[turn === 'p1' ? 'p1Target' : 'p2Target'] = '8';
          message = 'All your balls cleared! Sink the 8-ball to win!';
          this.state.lastShotResult = 'Group cleared';
        }
      } else if (shotResult.pocketed.length > 0) {
        // Opponent's balls pocketed - this is allowed but turn ends
        message = 'Opponent ball pocketed - turn ends';
        this.state.lastShotResult = 'Opponent ball';
      }
    }

    // Update remaining balls count
    this.state.p1BallsRemaining = this.getPlayerBallsRemaining('p1');
    this.state.p2BallsRemaining = this.getPlayerBallsRemaining('p2');

    // Determine next turn
    if (foulOccurred) {
      this.state.turn = opponent;
      this.state.ballInHand = true;
      this.state.currentRun = 0;
    } else if (continueTurn) {
      // Player continues
      this.state.ballInHand = false;
    } else {
      // Turn switches
      this.state.turn = opponent;
      this.state.ballInHand = false;
      this.state.currentRun = 0;
    }

    this.state.message = message || 'Shot complete';
    return this.getState();
  }

  /**
   * Evaluate break shot
   */
  private evaluateBreak(shotResult: ShotResult): GameState {
    let validBreak = false;
    let message = '';

    // Legal break: at least 4 balls hit cushions OR any ball pocketed
    const ballsHitCushion = shotResult.cushionHits.size;
    const ballsPocketed = shotResult.pocketed.length;

    if (ballsPocketed > 0 || ballsHitCushion >= 4) {
      validBreak = true;
    }

    // Check for scratch on break
    if (shotResult.cueScratch) {
      this.state.foul = true;
      this.state.foulType = 'SCRATCH';
      this.state.turn = this.state.turn === 'p1' ? 'p2' : 'p1';
      this.state.ballInHand = true;
      message = 'Scratch on break - opponent gets ball in hand';
      
      // Respawn any pocketed balls except cue
      // (This would be handled by the engine)
    } else if (!validBreak) {
      // Invalid break - opponent can accept or re-break
      this.state.foul = true;
      this.state.foulType = 'ILLEGAL_BREAK';
      message = 'Illegal break - less than 4 balls hit cushions';
    } else {
      message = 'Legal break!';
      
      // Check if 8-ball was pocketed on break
      if (shotResult.pocketed.includes(8)) {
        // 8-ball pocketed on break - player can choose to re-rack or spot the 8
        message = '8-ball pocketed on break - continuing game';
        // In some variations, this is an instant win. We'll continue the game.
      }
      
      // Try to assign groups based on break
      if (ballsPocketed > 0 && !shotResult.pocketed.includes(8)) {
        const solids = shotResult.pocketed.filter(id => id >= 1 && id <= 7);
        const stripes = shotResult.pocketed.filter(id => id >= 9 && id <= 15);
        
        if (solids.length > 0 && stripes.length === 0) {
          this.state.p1Target = 'SOLIDS';
          this.state.p2Target = 'STRIPES';
          message = 'Solids assigned on break!';
          this.state.p1Score += solids.length;
        } else if (stripes.length > 0 && solids.length === 0) {
          this.state.p1Target = 'STRIPES';
          this.state.p2Target = 'SOLIDS';
          message = 'Stripes assigned on break!';
          this.state.p1Score += stripes.length;
        } else if (solids.length > 0 && stripes.length > 0) {
          // Mixed balls - groups remain open
          message = 'Mixed balls pocketed - table remains open';
        }
      }
    }

    this.state.breakComplete = true;
    this.state.message = message;
    this.state.lastShotResult = validBreak ? 'Legal break' : 'Illegal break';
    
    // Update remaining balls
    this.state.p1BallsRemaining = this.getPlayerBallsRemaining('p1');
    this.state.p2BallsRemaining = this.getPlayerBallsRemaining('p2');
    
    return this.getState();
  }

  /**
   * Check for various fouls
   */
  private checkForFouls(shotResult: ShotResult, playerTarget: BallGroup): { 
    isFoul: boolean; 
    foulType: FoulType | null;
    message: string 
  } {
    // No contact foul
    if (shotResult.firstContact === null) {
      return { 
        isFoul: true, 
        foulType: 'NO_CONTACT',
        message: 'Foul: No ball contacted' 
      };
    }

    // Scratch foul
    if (shotResult.cueScratch) {
      return { 
        isFoul: true, 
        foulType: 'SCRATCH',
        message: 'Foul: Cue ball scratched' 
      };
    }

    // Wrong ball first contact
    if (playerTarget !== 'ANY' && playerTarget !== '8') {
      const firstBallGroup = this.getBallGroup(shotResult.firstContact);
      if (firstBallGroup !== playerTarget) {
        return { 
          isFoul: true, 
          foulType: 'WRONG_BALL_FIRST',
          message: 'Foul: Wrong ball contacted first' 
        };
      }
    }

    // 8-ball first when player still has balls
    if (playerTarget !== '8' && shotResult.firstContact === 8) {
      return { 
        isFoul: true, 
        foulType: 'EIGHT_BALL_EARLY',
        message: 'Foul: Cannot hit 8-ball yet' 
      };
    }

    // No rail after contact (must hit cushion or pocket a ball)
    if (shotResult.pocketed.length === 0 && shotResult.cushionHits.size === 0) {
      return { 
        isFoul: true, 
        foulType: 'NO_RAIL_AFTER_CONTACT',
        message: 'Foul: No rail hit after contact' 
      };
    }

    // Ball off table
    if (shotResult.ballsOffTable && shotResult.ballsOffTable.length > 0) {
      return { 
        isFoul: true, 
        foulType: 'BALL_OFF_TABLE',
        message: 'Foul: Ball jumped off table' 
      };
    }

    return { isFoul: false, foulType: null, message: '' };
  }

  /**
   * Handle 8-ball pocketing
   */
  private handle8BallPocket(shotResult: ShotResult, playerTarget: BallGroup, foulOccurred: boolean): GameState {
    const { turn } = this.state;
    const opponent: PlayerId = turn === 'p1' ? 'p2' : 'p1';
    const remaining = this.getPlayerBallsRemaining(turn);

    // Win condition: 8-ball pocketed legally after clearing own group
    if (playerTarget === '8' && remaining === 0 && !foulOccurred) {
      this.state.winner = turn;
      this.state.message = `${turn === 'p1' ? 'You' : 'Opponent'} win! 8-ball pocketed!`;
      this.state.lastShotResult = 'Victory!';
      
      // Update consecutive wins
      if (turn === 'p1') {
        this.state.gameStats.p1ConsecutiveWins++;
        this.state.gameStats.p2ConsecutiveWins = 0;
      } else {
        this.state.gameStats.p2ConsecutiveWins++;
        this.state.gameStats.p1ConsecutiveWins = 0;
      }
    } else {
      // Loss condition: 8-ball pocketed illegally
      this.state.winner = opponent;
      this.state.foul = true;
      this.state.foulType = 'EIGHT_BALL_EARLY';
      
      if (remaining > 0) {
        this.state.message = `${opponent === 'p1' ? 'You' : 'Opponent'} win! 8-ball pocketed early!`;
      } else if (foulOccurred) {
        this.state.message = `${opponent === 'p1' ? 'You' : 'Opponent'} win! 8-ball pocketed with foul!`;
      } else {
        this.state.message = `${opponent === 'p1' ? 'You' : 'Opponent'} win! 8-ball pocketed illegally!`;
      }
      this.state.lastShotResult = 'Game over';
      
      // Update consecutive wins
      if (opponent === 'p1') {
        this.state.gameStats.p1ConsecutiveWins++;
        this.state.gameStats.p2ConsecutiveWins = 0;
      } else {
        this.state.gameStats.p2ConsecutiveWins++;
        this.state.gameStats.p1ConsecutiveWins = 0;
      }
    }

    return this.getState();
  }

  /**
   * Assign ball groups after break or first legal shot
   */
  private assignGroups(pocketed: number[], currentPlayer: PlayerId): { 
    success: boolean; 
    foul: boolean;
    message: string 
  } {
    const solids = pocketed.filter(id => id >= 1 && id <= 7);
    const stripes = pocketed.filter(id => id >= 9 && id <= 15);

    if (solids.length > 0 && stripes.length === 0) {
      if (currentPlayer === 'p1') {
        this.state.p1Target = 'SOLIDS';
        this.state.p2Target = 'STRIPES';
      } else {
        this.state.p2Target = 'SOLIDS';
        this.state.p1Target = 'STRIPES';
      }
      return { 
        success: true, 
        foul: false,
        message: `${currentPlayer === 'p1' ? 'You are' : 'Opponent is'} SOLIDS` 
      };
    } else if (stripes.length > 0 && solids.length === 0) {
      if (currentPlayer === 'p1') {
        this.state.p1Target = 'STRIPES';
        this.state.p2Target = 'SOLIDS';
      } else {
        this.state.p2Target = 'STRIPES';
        this.state.p1Target = 'SOLIDS';
      }
      return { 
        success: true, 
        foul: false,
        message: `${currentPlayer === 'p1' ? 'You are' : 'Opponent is'} STRIPES` 
      };
    } else if (solids.length > 0 && stripes.length > 0) {
      return { 
        success: false, 
        foul: true,
        message: 'Foul: Mixed balls pocketed' 
      };
    }

    return { success: false, foul: false, message: '' };
  }

  /**
   * Count legally pocketed balls
   */
  private countLegalBalls(pocketed: number[], target: BallGroup): number {
    if (target === 'ANY' || target === '8') return 0;
    
    return pocketed.filter(id => {
      const group = this.getBallGroup(id);
      return group === target;
    }).length;
  }

  /**
   * Get ball group for a ball ID
   */
  private getBallGroup(ballId: number): BallGroup {
    if (ballId === 8) return '8';
    if (ballId >= 1 && ballId <= 7) return 'SOLIDS';
    if (ballId >= 9 && ballId <= 15) return 'STRIPES';
    return 'ANY';
  }

  /**
   * Get remaining balls for a player
   */
  private getPlayerBallsRemaining(player: PlayerId): number {
    const target = player === 'p1' ? this.state.p1Target : this.state.p2Target;
    
    if (target === 'SOLIDS') {
      return Array.from(this.activeBalls).filter(id => id >= 1 && id <= 7).length;
    } else if (target === 'STRIPES') {
      return Array.from(this.activeBalls).filter(id => id >= 9 && id <= 15).length;
    }
    
    return 7; // Default when groups not assigned
  }

  /**
   * Check if game is over
   */
  public isGameOver(): boolean {
    return this.state.winner !== null;
  }

  /**
   * Get winner
   */
  public getWinner(): PlayerId | null {
    return this.state.winner;
  }
}
