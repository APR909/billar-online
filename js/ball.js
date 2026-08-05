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
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fill();

    // ball base
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = this.isCue ? "#f5f0e6" : this.stripe ? "#f5f0e6" : this.color;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    if (this.stripe) {
      ctx.fillStyle = this.color;
      ctx.fillRect(x - r, y - r * 0.52, r * 2, r * 1.04);
    }

    // glossy highlight
    const grad = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r * 1.1);
    grad.addColorStop(0, "rgba(255,255,255,0.55)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.08)");
    grad.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    ctx.restore();

    // number lozenge
    if (this.number && !this.isCue) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = "#f5f0e6";
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.font = `${r * 0.55}px 'Work Sans', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(this.number), x, y + 0.5);
    }
  }
}
