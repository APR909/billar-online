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

export function drawAim(ctx, cue, state, stickColor = "#caa06a") {
  if (!cue || cue.potted) return;

  if (!state.dragging) return;

  const dx = cue.x - state.dragX;
  const dy = cue.y - state.dragY;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return;

  const dirX = dx / dist;
  const dirY = dy / dist;

  // aim line (where the ball will travel)
  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = "rgba(228,40,60,0.75)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cue.x + dirX * (cue.r + 4), cue.y + dirY * (cue.r + 4));
  ctx.lineTo(cue.x + dirX * 260, cue.y + dirY * 260);
  ctx.stroke();
  ctx.restore();

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
