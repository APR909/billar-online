import { PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, PLAY_BOTTOM, POCKETS, BALL_RADIUS } from "./table.js";

const FRICTION_DECEL = 95;      // px/s^2 rolling deceleration — lighter balls, roll further per shot
const MIN_SPEED = 6;            // snap to rest below this (px/s)
const WALL_RESTITUTION = 0.90;
const BALL_RESTITUTION = 0.98;
const SUBSTEPS = 8;
const COLLISION_ITERATIONS = 3; // extra passes per substep so impulses propagate through packed clusters (e.g. the break)

export function isSettled(balls) {
  return balls.every((b) => b.potted || b.speed < MIN_SPEED);
}

export function stepPhysics(balls, dt, onPot, onCollision) {
  const sub = dt / SUBSTEPS;
  for (let s = 0; s < SUBSTEPS; s++) {
    for (const b of balls) {
      if (b.potted) continue;
      integrate(b, sub);
    }
    for (const b of balls) {
      if (b.potted) continue;
      checkPocket(b, onPot);
    }
    for (const b of balls) {
      if (b.potted) continue;
      resolveWalls(b, onCollision);
    }
    for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
      resolveBallCollisions(balls, onCollision);
    }
  }
}

function integrate(b, dt) {
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  const speed = b.speed;
  if (speed > 0) {
    const drop = FRICTION_DECEL * dt;
    const newSpeed = Math.max(0, speed - drop);
    if (newSpeed < MIN_SPEED) {
      b.vx = 0;
      b.vy = 0;
    } else {
      const scale = newSpeed / speed;
      b.vx *= scale;
      b.vy *= scale;
    }
  }
}

function checkPocket(b, onPot) {
  for (const p of POCKETS) {
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < p.r - b.r * 0.35) {
      b.potted = true;
      b.vx = 0;
      b.vy = 0;
      onPot(b);
      return;
    }
  }
}

const COLLISION_SOUND_MIN_SPEED = 25; // px/s — filters out near-zero repeat detections within one frame

function resolveWalls(b, onCollision) {
  const left = PLAY_LEFT + b.r;
  const right = PLAY_RIGHT - b.r;
  const top = PLAY_TOP + b.r;
  const bottom = PLAY_BOTTOM - b.r;

  if (b.x < left) {
    const speed = Math.abs(b.vx);
    b.x = left;
    b.vx = -b.vx * WALL_RESTITUTION;
    if (onCollision && speed > COLLISION_SOUND_MIN_SPEED) onCollision("cushion", speed);
  }
  if (b.x > right) {
    const speed = Math.abs(b.vx);
    b.x = right;
    b.vx = -b.vx * WALL_RESTITUTION;
    if (onCollision && speed > COLLISION_SOUND_MIN_SPEED) onCollision("cushion", speed);
  }
  if (b.y < top) {
    const speed = Math.abs(b.vy);
    b.y = top;
    b.vy = -b.vy * WALL_RESTITUTION;
    if (onCollision && speed > COLLISION_SOUND_MIN_SPEED) onCollision("cushion", speed);
  }
  if (b.y > bottom) {
    const speed = Math.abs(b.vy);
    b.y = bottom;
    b.vy = -b.vy * WALL_RESTITUTION;
    if (onCollision && speed > COLLISION_SOUND_MIN_SPEED) onCollision("cushion", speed);
  }
}

function resolveBallCollisions(balls, onCollision) {
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.potted) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.potted) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = a.r + b.r;
      if (dist === 0 || dist >= minDist) continue;

      const nx = dx / dist;
      const ny = dy / dist;

      // separate overlapping balls
      const overlap = minDist - dist;
      a.x -= nx * overlap * 0.5;
      a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5;
      b.y += ny * overlap * 0.5;

      // relative velocity along the normal
      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const relVelAlongNormal = rvx * nx + rvy * ny;
      if (relVelAlongNormal > 0) continue; // already separating

      const impactSpeed = Math.abs(relVelAlongNormal);
      if (onCollision) onCollision("ball", impactSpeed, a, b);

      const impulse = -(1 + BALL_RESTITUTION) * relVelAlongNormal / 2; // equal mass
      a.vx -= impulse * nx;
      a.vy -= impulse * ny;
      b.vx += impulse * nx;
      b.vy += impulse * ny;
    }
  }
}

export { BALL_RADIUS };
