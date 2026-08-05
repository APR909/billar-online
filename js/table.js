// ============================================================
// TABLE GEOMETRY
// ============================================================
export const CANVAS_W = 1000;
export const CANVAS_H = 500;

export const RAIL = 30;          // wooden rail thickness
export const CUSHION = 14;       // extra cushion inset beyond rail

export const PLAY_LEFT = RAIL + CUSHION;
export const PLAY_TOP = RAIL + CUSHION;
export const PLAY_RIGHT = CANVAS_W - RAIL - CUSHION;
export const PLAY_BOTTOM = CANVAS_H - RAIL - CUSHION;

export const BALL_RADIUS = 11;
export const POCKET_RADIUS = 24;

// 6 pockets: 4 corners + 2 mid-rail
export const POCKETS = [
  { x: PLAY_LEFT, y: PLAY_TOP },
  { x: (PLAY_LEFT + PLAY_RIGHT) / 2, y: PLAY_TOP - 6 },
  { x: PLAY_RIGHT, y: PLAY_TOP },
  { x: PLAY_LEFT, y: PLAY_BOTTOM },
  { x: (PLAY_LEFT + PLAY_RIGHT) / 2, y: PLAY_BOTTOM + 6 },
  { x: PLAY_RIGHT, y: PLAY_BOTTOM },
].map((p) => ({ ...p, r: POCKET_RADIUS }));

export function drawTable(ctx) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // outer wood rail
  const woodGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  woodGrad.addColorStop(0, "#3a1f14");
  woodGrad.addColorStop(1, "#241009");
  ctx.fillStyle = woodGrad;
  roundRect(ctx, 0, 0, CANVAS_W, CANVAS_H, 18);
  ctx.fill();

  // cloth (slightly inset from rail, pockets cut as darker circles at the seam)
  const clothLeft = RAIL;
  const clothTop = RAIL;
  const clothRight = CANVAS_W - RAIL;
  const clothBottom = CANVAS_H - RAIL;

  const clothGrad = ctx.createRadialGradient(
    CANVAS_W / 2, CANVAS_H / 2, 40,
    CANVAS_W / 2, CANVAS_H / 2, CANVAS_W / 1.3
  );
  clothGrad.addColorStop(0, "#1c6b46");
  clothGrad.addColorStop(1, "#0e3f28");
  ctx.fillStyle = clothGrad;
  ctx.fillRect(clothLeft, clothTop, clothRight - clothLeft, clothBottom - clothTop);

  // playing cushions (inner raised edge)
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = CUSHION;
  roundRect(ctx, PLAY_LEFT, PLAY_TOP, PLAY_RIGHT - PLAY_LEFT, PLAY_BOTTOM - PLAY_TOP, 4);
  ctx.stroke();

  // spots (head + foot, subtle)
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  [0.22, 0.72].forEach((f) => {
    ctx.beginPath();
    ctx.arc(PLAY_LEFT + (PLAY_RIGHT - PLAY_LEFT) * f, (PLAY_TOP + PLAY_BOTTOM) / 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // pockets
  POCKETS.forEach((p) => {
    const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
    g.addColorStop(0, "#000000");
    g.addColorStop(1, "#1a1a1a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
