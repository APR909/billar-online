import { Ball } from "./ball.js";
import { PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, PLAY_BOTTOM, BALL_RADIUS } from "./table.js";

const COLORS = {
  1: "#F2C230", 2: "#1F5FBF", 3: "#D6272C", 4: "#7B3FA0",
  5: "#E8791C", 6: "#1F7A3D", 7: "#7A2E2E",
  9: "#F2C230", 10: "#1F5FBF", 11: "#D6272C", 12: "#7B3FA0",
  13: "#E8791C", 14: "#1F7A3D", 15: "#7A2E2E",
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createRack() {
  const centerY = (PLAY_TOP + PLAY_BOTTOM) / 2;
  const apexX = PLAY_LEFT + (PLAY_RIGHT - PLAY_LEFT) * 0.72;
  const headX = PLAY_LEFT + (PLAY_RIGHT - PLAY_LEFT) * 0.22;

  const d = BALL_RADIUS * 2;
  const rowGap = d * 0.87; // hex packing horizontal spacing

  // slot order per row (0..4 rows, r+1 balls each) — center slot of row 2 (index 2, slot 1) reserved for the 8-ball
  const slots = [];
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      slots.push({ row, i });
    }
  }

  const numbers = shuffle([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]);
  const balls = [];
  let numIdx = 0;

  slots.forEach(({ row, i }) => {
    const x = apexX + row * rowGap;
    const y = centerY - row * BALL_RADIUS + i * d;

    const isEightBallSlot = row === 2 && i === 1;
    const number = isEightBallSlot ? 8 : numbers[numIdx++];
    const stripe = number > 8;
    const color = number === 8 ? "#161616" : COLORS[number];

    balls.push(new Ball({ x, y, number, color, stripe }));
  });

  // cue ball
  const cue = new Ball({ x: headX, y: centerY, number: null, color: "#f5f0e6", isCue: true });
  balls.push(cue);

  return { balls, cue };
}
