# Physics Engine Test Plan

## Test Cases

### 1. Ball Collision Test
- Place cue ball and shoot at a group of balls
- **Expected**: Balls should scatter naturally, not cluster together
- **Check**: No balls sticking to each other
- **Check**: Each ball moves independently

### 2. Pocket Entry Test  
- Shoot balls at various angles towards pockets
- **Expected**: Only well-aimed shots pocket balls
- **Check**: Balls passing near pockets shouldn't be sucked in
- **Check**: Off-angle shots should miss the pocket

### 3. Rail Bounce Test
- Shoot cue ball at different angles to cushions
- **Expected**: Realistic bounce angles
- **Check**: Ball doesn't gain energy from rail
- **Check**: English affects bounce direction

### 4. Friction Test
- Shoot ball at various speeds
- **Expected**: Gradual deceleration, not instant stop
- **Check**: Slow balls roll naturally
- **Check**: Fast balls maintain momentum

### 5. Cue Ball Placement Test
- Get ball-in-hand (scratch)
- Place cue ball
- Try to shoot
- **Expected**: Can shoot immediately after placing
- **Check**: Ball doesn't re-place when trying to aim
- **Check**: Placement only happens once

## Quick Verification Commands
