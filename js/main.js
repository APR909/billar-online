import { drawTable, PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, PLAY_BOTTOM } from "./table.js";
import { createRack } from "./rack.js";
import { stepPhysics, isSettled } from "./physics.js";
import { createInput, drawAim } from "./input.js";

// =========================================================
// DOM
// =========================================================
const canvas = document.getElementById("table");
const ctx = canvas.getContext("2d");

const powerFillEl = document.getElementById("powerFill");
const ballsLeftEl = document.getElementById("ballsLeft");
const pottedTrayEl = document.getElementById("pottedTray");
const scratchFlashEl = document.getElementById("scratchFlash");
const resetBtn = document.getElementById("resetBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");

const modeSelectEl = document.getElementById("modeSelect");
const mpLobbyEl = document.getElementById("mpLobby");
const mpWaitingEl = document.getElementById("mpWaiting");
const gameStageEl = document.getElementById("gameStage");
const mpStatusBlockEl = document.getElementById("mpStatusBlock");
const roomCodeSmallEl = document.getElementById("roomCodeSmall");
const roomCodeBigEl = document.getElementById("roomCodeBig");
const turnIndicatorEl = document.getElementById("turnIndicator");
const scoreLineEl = document.getElementById("scoreLine");
const lobbyStatusEl = document.getElementById("lobbyStatus");
const joinCodeInput = document.getElementById("joinCodeInput");
const btnGoogleSignIn = document.getElementById("btnGoogleSignIn");
const googleProfileEl = document.getElementById("googleProfile");
const googleAvatarEl = document.getElementById("googleAvatar");
const googleNameEl = document.getElementById("googleName");

// =========================================================
// GAME STATE
// =========================================================
let balls = [];
let cue = null;
let pottedThisShot = [];
let awaitingRespawn = false;

// multiplayer state (null when playing locally)
let mp = null; // { code, playerId, unsubscribe, currentTurn, opponentGone, myName, opponentName }
let net = null; // lazily-loaded network module (only imported if multiplayer is chosen)

function screen(name) {
  modeSelectEl.classList.toggle("hidden", name !== "modeSelect");
  mpLobbyEl.classList.toggle("hidden", name !== "mpLobby");
  mpWaitingEl.classList.toggle("hidden", name !== "mpWaiting");
  gameStageEl.classList.toggle("hidden", name !== "game");
}

// =========================================================
// CORE GAME (shared by local + multiplayer)
// =========================================================
function newGame(rackOrder) {
  const rack = createRack(rackOrder);
  balls = rack.balls;
  cue = rack.cue;
  pottedTrayEl.innerHTML = "";
  pottedThisShot = [];
  awaitingRespawn = false;
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

function rebuildTrayFromState() {
  pottedTrayEl.innerHTML = "";
  balls.forEach((b) => {
    if (b.potted && !b.isCue) {
      const chip = document.createElement("div");
      chip.className = "potted-ball";
      chip.style.background = b.color;
      pottedTrayEl.appendChild(chip);
    }
  });
  updateBallsLeft();
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

function canShootNow() {
  if (!cue || cue.potted || !isSettled(balls)) return false;
  if (mp) return mp.currentTurn === mp.playerId && !mp.opponentGone;
  return true;
}

const input = createInput(
  canvas,
  () => cue,
  canShootNow,
  (vx, vy) => {
    cue.vx = vx;
    cue.vy = vy;
    if (mp) {
      net.sendShot(mp.code, mp.playerId, vx, vy);
      settleWatcher.armForLocalShot(true);
    }
  }
);

resetBtn.addEventListener("click", () => newGame(mp ? mp.rackOrderShared : undefined));

// =========================================================
// MULTIPLAYER: settle watcher — after a shot this client caused
// (either fired locally, or replayed from the opponent), once
// physics comes to rest we report the outcome.
// =========================================================
const settleWatcher = (() => {
  let waitingForLocalSettle = false;
  let isAuthoritative = false;

  return {
    armForLocalShot(authoritative) {
      waitingForLocalSettle = true;
      isAuthoritative = authoritative;
    },
    tick() {
      if (!mp || !waitingForLocalSettle) return;
      if (!isSettled(balls) || awaitingRespawn) return;
      waitingForLocalSettle = false;

      if (!isAuthoritative) {
        // just replaying the opponent's shot locally — they own the correction/turn-pass
        pottedThisShot = [];
        return;
      }

      const nextTurn = mp.playerId === "p1" ? "p2" : "p1";
      const gained = pottedThisShot.filter((b) => b.number !== 8).length;
      pottedThisShot = [];
      mp.myScore += gained;
      mp.currentTurn = nextTurn; // optimistic local update so input disables immediately

      const snapshot = balls.map((b) => ({
        x: Math.round(b.x * 100) / 100,
        y: Math.round(b.y * 100) / 100,
        potted: b.potted,
      }));
      net.sendCorrection(mp.code, mp.playerId, snapshot, nextTurn, { newScore: mp.myScore });
      updateTurnUI();
    },
  };
})();

function applyCorrection(snapshot) {
  balls.forEach((b, i) => {
    const s = snapshot[i];
    if (!s) return;
    b.x = s.x;
    b.y = s.y;
    b.vx = 0;
    b.vy = 0;
    b.potted = s.potted;
  });
  rebuildTrayFromState();
}

function updateTurnUI() {
  if (!mp) return;
  if (mp.opponentGone) {
    turnIndicatorEl.textContent = "rival desconectado";
    turnIndicatorEl.className = "turn-indicator";
    return;
  }
  const myTurn = mp.currentTurn === mp.playerId;
  turnIndicatorEl.textContent = myTurn ? "tu turno" : `turno de ${mp.opponentName || "tu rival"}`;
  turnIndicatorEl.className = "turn-indicator " + (myTurn ? "my-turn" : "their-turn");
}

function updateScoreUI(scores) {
  if (!scores) return;
  const me = mp.playerId === "p1" ? scores.p1 : scores.p2;
  const them = mp.playerId === "p1" ? scores.p2 : scores.p1;
  scoreLineEl.textContent = `${mp.myName || "tú"}: ${me || 0}  ·  ${mp.opponentName || "rival"}: ${them || 0}`;
}

function showGoogleProfile(profile) {
  if (!profile) return;
  btnGoogleSignIn.classList.add("hidden");
  googleProfileEl.classList.remove("hidden");
  googleNameEl.textContent = profile.name || "Conectado";
  if (profile.photo) googleAvatarEl.src = profile.photo;
  else googleAvatarEl.style.visibility = "hidden";
}

// =========================================================
// MAIN LOOP
// =========================================================
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;

  stepPhysics(balls, dt, onPot);
  respawnCueIfNeeded();
  settleWatcher.tick();

  drawTable(ctx);
  for (const b of balls) b.draw(ctx);
  drawAim(ctx, cue, input);

  powerFillEl.style.width = `${Math.round(input.power * 100)}%`;

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// =========================================================
// MODE SELECT / LOBBY WIRING
// =========================================================
document.getElementById("btnLocal").addEventListener("click", () => {
  mp = null;
  mpStatusBlockEl.classList.add("hidden");
  resetBtn.classList.remove("hidden");
  leaveRoomBtn.classList.add("hidden");
  newGame();
  screen("game");
});

document.getElementById("btnMultiplayer").addEventListener("click", async () => {
  lobbyStatusEl.textContent = "Cargando…";
  lobbyStatusEl.className = "lobby-status";
  try {
    net = await import("./network.js");
    lobbyStatusEl.textContent = "";
    showGoogleProfile(net.getProfile());
    screen("mpLobby");
  } catch (e) {
    console.error(e);
    lobbyStatusEl.textContent = "No se pudo conectar. ¿Configuraste firebase-config.js?";
    lobbyStatusEl.className = "lobby-status error";
  }
});

btnGoogleSignIn.addEventListener("click", async () => {
  btnGoogleSignIn.disabled = true;
  try {
    const profile = await net.signInWithGoogle();
    showGoogleProfile(profile);
  } catch (e) {
    console.error(e);
    lobbyStatusEl.textContent = "No se pudo iniciar sesión con Google.";
    lobbyStatusEl.className = "lobby-status error";
  } finally {
    btnGoogleSignIn.disabled = false;
  }
});

document.getElementById("btnBackToModeSelect").addEventListener("click", () => screen("modeSelect"));

document.getElementById("btnCreateRoom").addEventListener("click", async () => {
  lobbyStatusEl.textContent = "Creando sala…";
  lobbyStatusEl.className = "lobby-status";
  try {
    const { code, playerId, rackOrder, name } = await net.createRoom();
    mp = { code, playerId, currentTurn: "p1", myScore: 0, rackOrderShared: rackOrder, opponentGone: false, myName: name, opponentName: null };
    roomCodeBigEl.textContent = code;
    screen("mpWaiting");

    mp.unsubscribe = net.listenRoom(code, {
      onStatus: (status) => {
        if (status === "playing") startMultiplayerGame();
      },
    });
  } catch (e) {
    console.error(e);
    lobbyStatusEl.textContent = e.message || "Error al crear la sala.";
    lobbyStatusEl.className = "lobby-status error";
  }
});

document.getElementById("btnJoinRoom").addEventListener("click", async () => {
  const code = joinCodeInput.value.trim();
  if (!code) return;
  lobbyStatusEl.textContent = "Uniéndose…";
  lobbyStatusEl.className = "lobby-status";
  try {
    const { code: roomCode, playerId, rackOrder, name } = await net.joinRoom(code);
    mp = { code: roomCode, playerId, currentTurn: "p1", myScore: 0, rackOrderShared: rackOrder, opponentGone: false, myName: name, opponentName: null };
    startMultiplayerGame();
  } catch (e) {
    console.error(e);
    lobbyStatusEl.textContent = e.message || "Error al unirse a la sala.";
    lobbyStatusEl.className = "lobby-status error";
  }
});

document.getElementById("btnCancelWaiting").addEventListener("click", () => {
  if (mp) {
    mp.unsubscribe?.();
    net.leaveRoom(mp.code, mp.playerId);
    mp = null;
  }
  screen("mpLobby");
});

leaveRoomBtn.addEventListener("click", () => {
  if (mp) {
    mp.unsubscribe?.();
    net.leaveRoom(mp.code, mp.playerId);
    mp = null;
  }
  mpStatusBlockEl.classList.add("hidden");
  resetBtn.classList.remove("hidden");
  leaveRoomBtn.classList.add("hidden");
  screen("modeSelect");
});

function startMultiplayerGame() {
  if (mp.unsubscribe) mp.unsubscribe();

  newGame(mp.rackOrderShared);
  resetBtn.classList.add("hidden");
  leaveRoomBtn.classList.remove("hidden");
  mpStatusBlockEl.classList.remove("hidden");
  roomCodeSmallEl.textContent = `· ${mp.code}`;
  updateTurnUI();
  screen("game");

  mp.unsubscribe = net.listenRoom(mp.code, {
    onTurn: (turn) => {
      mp.currentTurn = turn;
      updateTurnUI();
    },
    onScores: (scores) => {
      mp.lastScores = scores;
      updateScoreUI(scores);
    },
    onShot: (shot) => {
      if (!shot || shot.by === mp.playerId) return;
      cue.vx = shot.vx;
      cue.vy = shot.vy;
      settleWatcher.armForLocalShot(false);
    },
    onCorrection: (correction) => {
      if (!correction || correction.by === mp.playerId) return;
      applyCorrection(correction.balls);
    },
    onPlayers: (players) => {
      const otherKey = mp.playerId === "p1" ? "p2" : "p1";
      const other = players && players[otherKey];
      const wasThere = mp.opponentGone === false;

      if (other && other.name && other.name !== mp.opponentName) {
        mp.opponentName = other.name;
        updateTurnUI();
        if (mp.lastScores) updateScoreUI(mp.lastScores);
      }
      if (wasThere && players && !other) {
        mp.opponentGone = true;
        updateTurnUI();
      }
    },
  });
}

screen("modeSelect");
