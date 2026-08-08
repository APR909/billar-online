// ============================================================
// TABLE GEOMETRY
// ============================================================
export const CANVAS_W = 1160;
export const CANVAS_H = 580;

export const RAIL = 35;          // wooden rail thickness
export const CUSHION = 16;       // extra cushion inset beyond rail

export const PLAY_LEFT = RAIL + CUSHION;
export const PLAY_TOP = RAIL + CUSHION;
export const PLAY_RIGHT = CANVAS_W - RAIL - CUSHION;
export const PLAY_BOTTOM = CANVAS_H - RAIL - CUSHION;

export const BALL_RADIUS = 13;
export const POCKET_RADIUS = 28;

// 6 pockets: 4 corners + 2 mid-rail
export const POCKETS = [
  { x: PLAY_LEFT, y: PLAY_TOP },
  { x: (PLAY_LEFT + PLAY_RIGHT) / 2, y: PLAY_TOP - 6 },
  { x: PLAY_RIGHT, y: PLAY_TOP },
  { x: PLAY_LEFT, y: PLAY_BOTTOM },
  { x: (PLAY_LEFT + PLAY_RIGHT) / 2, y: PLAY_BOTTOM + 6 },
  { x: PLAY_RIGHT, y: PLAY_BOTTOM },
].map((p) => ({ ...p, r: POCKET_RADIUS }));

// ---------- veins along the rail — generated once, redrawn every frame ----------
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function generateVeins() {
  const rand = seededRandom(1337);
  const inset = RAIL / 2;
  const jitter = 7;
  const step = 16;
  const margin = 6;

  const main = [];
  for (let x = RAIL + margin; x <= CANVAS_W - RAIL - margin; x += step) {
    main.push({ x, y: inset + (rand() - 0.5) * jitter * 2 });
  }
  for (let y = RAIL + margin; y <= CANVAS_H - RAIL - margin; y += step) {
    main.push({ x: CANVAS_W - inset + (rand() - 0.5) * jitter * 2, y });
  }
  for (let x = CANVAS_W - RAIL - margin; x >= RAIL + margin; x -= step) {
    main.push({ x, y: CANVAS_H - inset + (rand() - 0.5) * jitter * 2 });
  }
  for (let y = CANVAS_H - RAIL - margin; y >= RAIL + margin; y -= step) {
    main.push({ x: inset + (rand() - 0.5) * jitter * 2, y });
  }
  if (main.length) main.push(main[0]);

  const branches = [];
  main.forEach((p) => {
    if (rand() < 0.14) {
      const len = 7 + rand() * 9;
      const angle = rand() * Math.PI * 2;
      const midAngle = angle + (rand() - 0.5) * 0.8;
      const midLen = len * (0.5 + rand() * 0.3);
      branches.push([
        { x: p.x, y: p.y },
        { x: p.x + Math.cos(midAngle) * midLen, y: p.y + Math.sin(midAngle) * midLen },
        { x: p.x + Math.cos(angle) * len, y: p.y + Math.sin(angle) * len },
      ]);
    }
  });

  return { main, branches };
}

const VEINS = generateVeins();

function strokeSmoothPath(ctx, points) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

function drawVeins(ctx) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // soft glow pass
  ctx.strokeStyle = "rgba(255,70,20,0.32)";
  ctx.lineWidth = 5;
  ctx.shadowColor = "rgba(255,60,10,0.9)";
  ctx.shadowBlur = 8;
  strokeSmoothPath(ctx, VEINS.main);

  // bright core line
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,125,55,0.85)";
  ctx.lineWidth = 1.4;
  strokeSmoothPath(ctx, VEINS.main);

  // small branching offshoots
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,95,35,0.55)";
  VEINS.branches.forEach((b) => strokeSmoothPath(ctx, b));

  ctx.restore();
}

export function drawTable(ctx) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // outer rail — charred obsidian with a warm ember undertone
  const woodGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  woodGrad.addColorStop(0, "#2a0f0f");
  woodGrad.addColorStop(1, "#140505");
  ctx.fillStyle = woodGrad;
  roundRect(ctx, 0, 0, CANVAS_W, CANVAS_H, 18);
  ctx.fill();

  drawVeins(ctx);

  // cloth (slightly inset from rail, pockets cut as darker circles at the seam)
  const clothLeft = RAIL;
  const clothTop = RAIL;
  const clothRight = CANVAS_W - RAIL;
  const clothBottom = CANVAS_H - RAIL;

  const clothGrad = ctx.createRadialGradient(
    CANVAS_W / 2, CANVAS_H / 2, 40,
    CANVAS_W / 2, CANVAS_H / 2, CANVAS_W / 1.3
  );
  clothGrad.addColorStop(0, "#8c1420");
  clothGrad.addColorStop(1, "#2e0509");
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

  // pockets — hexagonal, with a faint ember rim
  POCKETS.forEach((p) => {
    const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
    g.addColorStop(0, "#000000");
    g.addColorStop(0.75, "#1a0505");
    g.addColorStop(1, "#3a0a0a");
    ctx.fillStyle = g;
    hexagonPath(ctx, p.x, p.y, p.r);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,90,40,0.55)";
    ctx.lineWidth = 1.6;
    hexagonPath(ctx, p.x, p.y, p.r - 1);
    ctx.stroke();
  });
}

function hexagonPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2; // pointy-top hexagon
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
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
