import { PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, PLAY_BOTTOM, POCKETS, BALL_RADIUS } from "./table.js";

const FRICTION_DECEL = 140;     // px/s^2 rolling deceleration
const MIN_SPEED = 6;            // snap to rest below this (px/s)
const WALL_RESTITUTION = 0.86;
const BALL_RESTITUTION = 0.98;
const SUBSTEPS = 8;
const COLLISION_ITERATIONS = 3; // extra passes per substep so impulses propagate through packed clusters (e.g. the break)

export function isSettled(balls) {
  return balls.every((b) => b.potted || b.speed < MIN_SPEED);
}

export function stepPhysics(balls, dt, onPot) {
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
      resolveWalls(b);
    }
    for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
      resolveBallCollisions(balls);
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

function resolveWalls(b) {
  const left = PLAY_LEFT + b.r;
  const right = PLAY_RIGHT - b.r;
  const top = PLAY_TOP + b.r;
  const bottom = PLAY_BOTTOM - b.r;

  if (b.x < left) { b.x = left; b.vx = -b.vx * WALL_RESTITUTION; }
  if (b.x > right) { b.x = right; b.vx = -b.vx * WALL_RESTITUTION; }
  if (b.y < top) { b.y = top; b.vy = -b.vy * WALL_RESTITUTION; }
  if (b.y > bottom) { b.y = bottom; b.vy = -b.vy * WALL_RESTITUTION; }
}

function resolveBallCollisions(balls) {
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

      const impulse = -(1 + BALL_RESTITUTION) * relVelAlongNormal / 2; // equal mass
      a.vx -= impulse * nx;
      a.vy -= impulse * ny;
      b.vx += impulse * nx;
      b.vy += impulse * ny;
    }
  }
}

export { BALL_RADIUS };
