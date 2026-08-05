import { drawTable, PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, PLAY_BOTTOM } from "./table.js";
import { createRack } from "./rack.js";
import { stepPhysics, isSettled } from "./physics.js";
import { createInput, drawAim } from "./input.js";

const canvas = document.getElementById("table");
const ctx = canvas.getContext("2d");

const powerFillEl = document.getElementById("powerFill");
const ballsLeftEl = document.getElementById("ballsLeft");
const pottedTrayEl = document.getElementById("pottedTray");
const scratchFlashEl = document.getElementById("scratchFlash");
const resetBtn = document.getElementById("resetBtn");

let balls = [];
let cue = null;
let pottedThisShot = [];
let awaitingRespawn = false;

function newGame() {
  const rack = createRack();
  balls = rack.balls;
  cue = rack.cue;
  pottedTrayEl.innerHTML = "";
  updateBallsLeft();
}

function updateBallsLeft() {
  const remaining = balls.filter((b) => !b.potted && !b.isCue).length;
  ballsLeftEl.textContent = String(remaining);
}

function flashScratch() {
  scratchFlashEl.classList.add("show");
  setTimeout(() => scratchFlashEl.classList.remove("show"), 1600);
}

function onPot(ball) {
  if (ball.isCue) {
    awaitingRespawn = true;
    return;
  }
  pottedThisShot.push(ball);
  const chip = document.createElement("div");
  chip.className = "potted-ball";
  chip.style.background = ball.color;
  pottedTrayEl.appendChild(chip);
  updateBallsLeft();
}

function respawnCueIfNeeded() {
  if (awaitingRespawn && isSettled(balls)) {
    cue.potted = false;
    cue.x = PLAY_LEFT + (PLAY_RIGHT - PLAY_LEFT) * 0.22;
    cue.y = (PLAY_TOP + PLAY_BOTTOM) / 2;
    cue.vx = 0;
    cue.vy = 0;
    awaitingRespawn = false;
    flashScratch();
  }
}

const input = createInput(
  canvas,
  () => cue,
  () => isSettled(balls) && !cue.potted,
  (vx, vy) => {
    cue.vx = vx;
    cue.vy = vy;
  }
);

resetBtn.addEventListener("click", newGame);

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;

  stepPhysics(balls, dt, onPot);
  respawnCueIfNeeded();

  drawTable(ctx);
  for (const b of balls) b.draw(ctx);
  drawAim(ctx, cue, input);

  powerFillEl.style.width = `${Math.round(input.power * 100)}%`;

  requestAnimationFrame(loop);
}

newGame();
requestAnimationFrame(loop);
