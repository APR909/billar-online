const MAX_DRAG = 130;      // px of drag = full power
const MAX_SHOT_SPEED = 900; // px/s at full power

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

export function drawAim(ctx, cue, state) {
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
  ctx.strokeStyle = "#caa06a";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cue.x - dirX * stickStart, cue.y - dirY * stickStart);
  ctx.lineTo(cue.x - dirX * stickEnd, cue.y - dirY * stickEnd);
  ctx.stroke();
  ctx.restore();
}
