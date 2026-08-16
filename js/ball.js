import { BALL_RADIUS } from "./table.js";

export class Ball {
  constructor({ x, y, number, color, stripe = false, isCue = false }) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.r = BALL_RADIUS;
    this.number = number;
    this.color = color;
    this.stripe = stripe;
    this.isCue = isCue;
    this.potted = false;
    this.rotation = 0;
    this.cracks = !isCue && number !== 8 ? generateCracks(this.r) : [];
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  draw(ctx) {
    if (this.potted) return;
    const { x, y, r } = this;

    ctx.save();

    // shadow
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 3, r * 0.95, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();

    if (this.isCue) {
      // pale, faintly glowing soul-orb
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r * 1.15);
      g.addColorStop(0, "#fff6e6");
      g.addColorStop(0.55, "#f0e2c8");
      g.addColorStop(1, "#cfa87a");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);

      // a faint marking so the roll is visible, like a spin-training cue ball
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.rotation);
      ctx.fillStyle = "rgba(180,60,50,0.35)";
      ctx.beginPath();
      ctx.arc(r * 0.5, 0, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      // dark obsidian base for every numbered ball
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r * 1.15);
      g.addColorStop(0, "#2c1a16");
      g.addColorStop(0.6, "#170d0a");
      g.addColorStop(1, "#0a0504");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.rotation);
      ctx.translate(-x, -y);

      if (this.number === 8) {
        // faint glowing red rune ring
        ctx.save();
        ctx.shadowColor = "#FF3B2E";
        ctx.shadowBlur = r * 0.5;
        ctx.strokeStyle = "rgba(255,60,45,0.85)";
        ctx.lineWidth = r * 0.1;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (this.stripe) {
        // glowing molten band instead of a painted stripe
        ctx.save();
        ctx.shadowColor = this.color;
        ctx.shadowBlur = r * 0.55;
        ctx.fillStyle = this.color;
        ctx.globalAlpha = 0.92;
        ctx.fillRect(x - r, y - r * 0.5, r * 2, r);
        ctx.restore();
      } else {
        // glowing lava cracks in the ball's identity color
        ctx.save();
        ctx.shadowColor = this.color;
        ctx.shadowBlur = r * 0.45;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = Math.max(1.2, r * 0.13);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        this.cracks.forEach((segs) => {
          ctx.beginPath();
          segs.forEach((seg, i) => {
            const px = x + Math.cos(seg.a) * seg.dist;
            const py = y + Math.sin(seg.a) * seg.dist;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
        });
        ctx.restore();
      }

      ctx.restore();
    }

    // glossy highlight (polished dark rock / bone catching the light)
    const grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r * 1.1);
    grad.addColorStop(0, "rgba(255,255,255,0.4)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.05)");
    grad.addColorStop(1, "rgba(0,0,0,0.3)");
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    ctx.restore();

    // number lozenge, ember-rimmed for readability
    if (this.number && !this.isCue) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.rotation);
      ctx.translate(-x, -y);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.46, 0, Math.PI * 2);
      ctx.fillStyle = "#f5f0e6";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,90,40,0.7)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#1a0e0a";
      ctx.font = `${r * 0.55}px 'Work Sans', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(this.number), x, y + 0.5);
      ctx.restore();
    }
  }
}

function generateCracks(r) {
  const cracks = [];
  const count = 2 + (Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < count; i++) {
    let a = Math.random() * Math.PI * 2;
    let dist = r * 0.12;
    const segs = [{ a, dist }];
    for (let s = 0; s < 2; s++) {
      a += (Math.random() - 0.5) * 1.2;
      dist = Math.min(dist + r * (0.26 + Math.random() * 0.16), r * 0.9);
      segs.push({ a, dist });
    }
    cracks.push(segs);
  }
  return cracks;
}
