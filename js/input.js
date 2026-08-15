import { PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, PLAY_BOTTOM } from "./table.js";

const MAX_DRAG = 130;      // px of drag = full power
export const MAX_SHOT_SPEED = 900; // px/s at full power

export function createInput(canvas, getCueBall, canShoot, onShoot) {
  const state = {
    dragging: false,
    dragX: 0,
    dragY: 0,
    power: 0,
  };

  function toCanvasCoords(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY,
    };
  }

  canvas.addEventListener("pointerdown", (evt) => {
    if (!canShoot()) return;
    const cue = getCueBall();
    if (!cue || cue.potted) return;
    const p = toCanvasCoords(evt);
    state.dragging = true;
    state.dragX = p.x;
    state.dragY = p.y;
    state.power = 0;
    canvas.setPointerCapture(evt.pointerId);
  });

  canvas.addEventListener("pointermove", (evt) => {
    if (!state.dragging) return;
    const p = toCanvasCoords(evt);
    state.dragX = p.x;
    state.dragY = p.y;

    const cue = getCueBall();
    const dx = state.dragX - cue.x;
    const dy = state.dragY - cue.y;
    const dragDist = Math.min(Math.hypot(dx, dy), MAX_DRAG);
    state.power = dragDist / MAX_DRAG;
  });

  function release() {
    if (!state.dragging) return;
    state.dragging = false;
    const cue = getCueBall();
    const dx = cue.x - state.dragX;
    const dy = cue.y - state.dragY;
    const dist = Math.hypot(dx, dy);
    if (dist > 6 && state.power > 0.05) {
      const dirX = dx / dist;
      const dirY = dy / dist;
      const speed = state.power * MAX_SHOT_SPEED;
      onShoot(dirX * speed, dirY * speed);
    }
    state.power = 0;
  }

  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  return state;
}

/** Casts the cue ball's travel ray forward and finds whichever comes first:
 *  another ball, or a rail. Returns { dist, kind: "ball"|"rail", ball?, wallNormal? }. */
function raycastAim(cue, dirX, dirY, balls) {
  let best = { dist: Infinity, kind: null };

  // rails — account for the cue ball's own radius offsetting the playable bounds
  const left = PLAY_LEFT + cue.r;
  const right = PLAY_RIGHT - cue.r;
  const top = PLAY_TOP + cue.r;
  const bottom = PLAY_BOTTOM - cue.r;

  if (dirX > 0) {
    const d = (right - cue.x) / dirX;
    if (d > 0 && d < best.dist) best = { dist: d, kind: "rail", wallNormal: { x: -1, y: 0 } };
  } else if (dirX < 0) {
    const d = (left - cue.x) / dirX;
    if (d > 0 && d < best.dist) best = { dist: d, kind: "rail", wallNormal: { x: 1, y: 0 } };
  }
  if (dirY > 0) {
    const d = (bottom - cue.y) / dirY;
    if (d > 0 && d < best.dist) best = { dist: d, kind: "rail", wallNormal: { x: 0, y: -1 } };
  } else if (dirY < 0) {
    const d = (top - cue.y) / dirY;
    if (d > 0 && d < best.dist) best = { dist: d, kind: "rail", wallNormal: { x: 0, y: 1 } };
  }

  // other balls — ray vs. circle of radius (ball.r + cue.r) around each ball center
  for (const b of balls) {
    if (b === cue || b.potted) continue;
    const ocx = b.x - cue.x;
    const ocy = b.y - cue.y;
    const proj = ocx * dirX + ocy * dirY;
    if (proj < 0) continue;
    const combined = b.r + cue.r;
    const closestSq = ocx * ocx + ocy * ocy - proj * proj;
    const combinedSq = combined * combined;
    if (closestSq > combinedSq) continue;
    const d = proj - Math.sqrt(combinedSq - closestSq);
    if (d > 0 && d < best.dist) best = { dist: d, kind: "ball", ball: b };
  }

  return best;
}

export function drawAim(ctx, cue, state, stickColor = "#caa06a", balls = []) {
  if (!cue || cue.potted) return;

  if (!state.dragging) return;

  const dx = cue.x - state.dragX;
  const dy = cue.y - state.dragY;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return;

  const dirX = dx / dist;
  const dirY = dy / dist;

  const hit = raycastAim(cue, dirX, dirY, balls);
  const travelDist = Math.min(hit.dist, 900);
  const hitX = cue.x + dirX * travelDist;
  const hitY = cue.y + dirY * travelDist;

  // aim line (where the cue ball will travel before its first contact)
  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = "rgba(228,40,60,0.75)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cue.x + dirX * (cue.r + 4), cue.y + dirY * (cue.r + 4));
  ctx.lineTo(hitX, hitY);
  ctx.stroke();
  ctx.restore();

  if (hit.kind === "ball") {
    // ghost ball — where the cue ball's center sits at the moment of contact
    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(243,239,234,0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hitX, hitY, cue.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // predicted object-ball travel direction: straight out from its own
    // center, through the contact point
    const ox = hit.ball.x - hitX;
    const oy = hit.ball.y - hitY;
    const oLen = Math.hypot(ox, oy) || 1;
    const onx = -ox / oLen; // points from contact point away through the object ball
    const ony = -oy / oLen;
    ctx.save();
    ctx.setLineDash([5, 7]);
    ctx.strokeStyle = "rgba(120,255,170,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hit.ball.x, hit.ball.y);
    ctx.lineTo(hit.ball.x + onx * 130, hit.ball.y + ony * 130);
    ctx.stroke();
    ctx.restore();
  } else if (hit.kind === "rail" && hit.dist < 850) {
    // bank preview — a shorter reflected segment off the rail
    const n = hit.wallNormal;
    const dot = dirX * n.x + dirY * n.y;
    const rx = dirX - 2 * dot * n.x;
    const ry = dirY - 2 * dot * n.y;
    ctx.save();
    ctx.setLineDash([5, 7]);
    ctx.strokeStyle = "rgba(228,40,60,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hitX, hitY);
    ctx.lineTo(hitX + rx * 140, hitY + ry * 140);
    ctx.stroke();
    ctx.restore();
  }

  // cue stick pulled back opposite the shot direction
  const pull = Math.min(dist, 130);
  const stickStart = cue.r + 14 + pull;
  const stickEnd = stickStart + 150;

  ctx.save();
  ctx.strokeStyle = stickColor;
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cue.x - dirX * stickStart, cue.y - dirY * stickStart);
  ctx.lineTo(cue.x - dirX * stickEnd, cue.y - dirY * stickEnd);
  ctx.stroke();
  ctx.restore();

  // demonic eye set into the butt end, staring down the shaft at the cue ball
  const eyeX = cue.x - dirX * stickEnd;
  const eyeY = cue.y - dirY * stickEnd;
  const irisX = eyeX + dirX * 2;
  const irisY = eyeY + dirY * 2;

  ctx.save();
  // socket
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, 6.5, 0, Math.PI * 2);
  ctx.fillStyle = "#170905";
  ctx.fill();
  ctx.strokeStyle = "#3a1a0e";
  ctx.lineWidth = 1;
  ctx.stroke();

  // glowing iris
  const irisGrad = ctx.createRadialGradient(irisX, irisY, 0.4, irisX, irisY, 3.6);
  irisGrad.addColorStop(0, "#FFD9A0");
  irisGrad.addColorStop(0.45, "#FF5A28");
  irisGrad.addColorStop(1, "#7a1a0a");
  ctx.shadowColor = "rgba(255,90,30,0.9)";
  ctx.shadowBlur = 7;
  ctx.fillStyle = irisGrad;
  ctx.beginPath();
  ctx.arc(irisX, irisY, 3.6, 0, Math.PI * 2);
  ctx.fill();

  // vertical slit pupil
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#0a0302";
  ctx.beginPath();
  ctx.ellipse(irisX, irisY, 0.9, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
