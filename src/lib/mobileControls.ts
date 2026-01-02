// Mobile Touch Controls for Pool Game
export interface TouchControl {
  type: 'aim' | 'shoot' | 'power';
  x: number;
  y: number;
  startTime: number;
}

export interface TouchGesture {
  type: 'tap' | 'swipe' | 'pinch' | 'spread';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  distance: number;
  duration: number;
}

export class MobileControls {
  private canvas: HTMLCanvasElement | null;
  private controls: TouchControl[] = [];
  private gestures: TouchGesture[] = [];
  private isAiming: boolean = false;
  private shotPower: number = 50;
  private onAimChange: (angle: number, power: number) => void;
  private onShoot: () => void;
  private onPowerChange: (power: number) => void;

  constructor(
    canvas: HTMLCanvasElement,
    onAimChange: (angle: number, power: number) => void,
    onShoot: () => void,
    onPowerChange: (power: number) => void
  ) {
    this.canvas = canvas;
    this.onAimChange = onAimChange;
    this.onShoot = onShoot;
    this.onPowerChange = onPowerChange;
    
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.canvas) return;

    // Prevent default touch behaviors
    this.canvas.style.touchAction = 'none';
    
    // Touch events
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.handleTouchEnd, { passive: false });
    
    // Mouse events for desktop testing
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);
    
    // Prevent context menu on long press
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  private handleTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    
    const touch = e.touches[0];
    if (!touch) return;

    const rect = this.canvas?.getBoundingClientRect();
    if (!rect) return;
    
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    this.controls.push({
      type: 'aim',
      x,
      y,
      startTime: Date.now()
    });

    this.isAiming = true;
  }

  private handleTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    
    const touch = e.touches[0];
    if (!touch || !this.isAiming) return;

    const rect = this.canvas?.getBoundingClientRect();
    if (!rect) return;
    
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // Update aim control
    const aimControl = this.controls.find(c => c.type === 'aim');
    if (aimControl) {
      aimControl.x = x;
      aimControl.y = y;
    }

    // Check for power gesture
    this.checkPowerGesture(x, y);
  }

  private handleTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    
    const touch = e.changedTouches[0];
    if (!touch) return;

    const rect = this.canvas?.getBoundingClientRect();
    if (!rect) return;
    
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    // Remove aim control
    this.controls = this.controls.filter(c => c.type !== 'aim');

    // Check for shot gesture
    const endTime = Date.now();
    const aimControl = this.controls.find(c => c.type === 'aim');
    
    if (aimControl) {
      const duration = endTime - aimControl.startTime;
      
      // Quick tap = shot
      if (duration < 200) {
        this.controls.push({
          type: 'shoot',
          x: aimControl.x,
          y: aimControl.y,
          startTime: endTime
        });
        
        this.isAiming = false;
        this.processControls();
      } else {
        // Long press or drag - treat as aim end
        this.isAiming = false;
      }
    }

    // Check for swipe gesture
    this.checkSwipeGesture(x, y);
  }

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      const rect = this.canvas?.getBoundingClientRect();
      if (!rect) return;
      
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.controls.push({
        type: 'aim',
        x,
        y,
        startTime: Date.now()
      });

      this.isAiming = true;
    }
  }

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isAiming || e.buttons !== 1) return;

    const rect = this.canvas?.getBoundingClientRect();
    if (!rect) return;
    
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const aimControl = this.controls.find(c => c.type === 'aim');
    if (aimControl) {
      aimControl.x = x;
      aimControl.y = y;
    }

    this.checkPowerGesture(x, y);
  }

  private handleMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      const rect = this.canvas?.getBoundingClientRect();
      if (!rect) return;
      
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Remove aim control
      this.controls = this.controls.filter(c => c.type !== 'aim');

      const endTime = Date.now();
      const aimControl = this.controls.find(c => c.type === 'aim');
      
      if (aimControl) {
        const duration = endTime - aimControl.startTime;
        
        // Quick click = shot
        if (duration < 200) {
          this.controls.push({
            type: 'shoot',
            x: aimControl.x,
            y: aimControl.y,
            startTime: endTime
          });
          
          this.isAiming = false;
          this.processControls();
        } else {
          // Long press or drag - treat as aim end
          this.isAiming = false;
        }
      }
    }
  }

  private checkPowerGesture(x: number, y: number): void {
    const recentControls = this.controls.filter(c => 
      c.type === 'aim' && Date.now() - c.startTime < 500
    );

    if (recentControls.length < 2) return;

    // Check for power gesture (pinch or spread)
    if (recentControls.length === 2) {
      const control1 = recentControls[0];
      const control2 = recentControls[1];
      
      const dx = control2.x - control1.x;
      const dy = control2.y - control1.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 30) {
        // Pinch gesture detected
        const angle = Math.atan2(dy, dx);
        const power = Math.min(100, Math.max(0, 100 - distance));
        
        this.controls.push({
          type: 'power',
          x: control2.x,
          y: control2.y,
          startTime: Date.now()
        });

        this.shotPower = power;
        this.onPowerChange(power);
        this.onAimChange(angle, power);
      }
    }
  }

  private checkSwipeGesture(x: number, y: number): void {
    const recentControls = this.controls.filter(c => 
      c.type === 'aim' && Date.now() - c.startTime < 1000
    );

    if (recentControls.length < 2) return;

    const control1 = recentControls[0];
    const control2 = recentControls[1];
    
    const dx = control2.x - control1.x;
    const dy = control2.y - control1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const duration = Date.now() - control1.startTime;
    
    if (distance > 50 && duration < 300) {
      // Swipe gesture detected
      const angle = Math.atan2(dy, dx);
      
      this.gestures.push({
        type: 'swipe',
        startX: control1.x,
        startY: control1.y,
        endX: control2.x,
        endY: control2.y,
        distance,
        duration,
        direction: this.getSwipeDirection(dx, dy)
      });

      // Clear old controls
      this.controls = [];
      this.isAiming = false;
    }
  }

  private getSwipeDirection(dx: number, dy: number): 'up' | 'down' | 'left' | 'right' {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    if (absDx > absDy) {
      return dx > 0 ? 'right' : 'left';
    } else {
      return dy > 0 ? 'down' : 'up';
    }
  }

  private processControls(): void {
    const aimControl = this.controls.find(c => c.type === 'aim');
    const powerControl = this.controls.find(c => c.type === 'power');
    const shootControl = this.controls.find(c => c.type === 'shoot');

    if (aimControl) {
      const centerX = this.canvas ? this.canvas.width / 2 : 0;
      const centerY = this.canvas ? this.canvas.height / 2 : 0;
      
      // Calculate angle from center
      const angle = Math.atan2(aimControl.y - centerY, aimControl.x - centerX);
      this.onAimChange(angle, this.shotPower);
    }

    if (powerControl) {
      this.onPowerChange(this.shotPower);
    }

    if (shootControl) {
      this.onShoot();
    }
  }

  public getControls(): TouchControl[] {
    return [...this.controls];
  }

  public getGestures(): TouchGesture[] {
    return [...this.gestures];
  }

  public clearControls(): void {
    this.controls = [];
    this.gestures = [];
    this.isAiming = false;
  }

  public getAimDirection(): number {
    const aimControl = this.controls.find(c => c.type === 'aim');
    if (!aimControl || !this.canvas) return 0;

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    
    return Math.atan2(aimControl.y - centerY, aimControl.x - centerX);
  }

  public getShotPower(): number {
    return this.shotPower;
  }

  public setShotPower(power: number): void {
    this.shotPower = Math.max(0, Math.min(100, power));
    this.onPowerChange(power);
  }

  public isAimingActive(): boolean {
    return this.isAiming;
  }

  public destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener('touchstart', this.handleTouchStart);
      this.canvas.removeEventListener('touchmove', this.handleTouchMove);
      this.canvas.removeEventListener('touchend', this.handleTouchEnd);
      this.canvas.removeEventListener('mousedown', this.handleMouseDown);
      this.canvas.removeEventListener('mousemove', this.handleMouseMove);
      this.canvas.removeEventListener('mouseup', this.handleMouseUp);
      this.canvas.removeEventListener('contextmenu', (e: Event) => e.preventDefault());
    }
  }
}

export default MobileControls;