import { drawTable, PLAY_LEFT, PLAY_RIGHT, PLAY_TOP, PLAY_BOTTOM } from "./table.js";
import { createRack } from "./rack.js";
import { stepPhysics, isSettled } from "./physics.js";
import { createInput, drawAim, MAX_SHOT_SPEED } from "./input.js";
import { playStrike, playBallHit, playCushionHit, playPot } from "./sound.js";

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
const statusFaceEl = document.getElementById("statusFace");
const statusFaceImgEl = document.getElementById("statusFaceImg");
const waitingSkullsEl = document.getElementById("waitingSkulls");

const titleScreenEl = document.getElementById("titleScreen");
const titleDemonImg = document.getElementById("titleDemonImg");

let titleMouthOpen = false;
const titleMouthTimer = setInterval(() => {
  titleMouthOpen = !titleMouthOpen;
  titleDemonImg.src = titleMouthOpen ? "assets/face-title-open.png" : "assets/face-title-closed.png";
}, 550);
const modeSelectEl = document.getElementById("modeSelect");
const mpLobbyEl = document.getElementById("mpLobby");
const mpWaitingEl = document.getElementById("mpWaiting");
const gameStageEl = document.getElementById("gameStage");
const mpStatusBlockEl = document.getElementById("mpStatusBlock");
const roomCodeSmallEl = document.getElementById("roomCodeSmall");
const roomCodeBigEl = document.getElementById("roomCodeBig");
const turnIndicatorEl = document.getElementById("turnIndicator");
const scoreLineEl = document.getElementById("scoreLine");
const groupLineEl = document.getElementById("groupLine");
const foulLineEl = document.getElementById("foulLine");
const lobbyStatusEl = document.getElementById("lobbyStatus");
const joinCodeInput = document.getElementById("joinCodeInput");
const btnGoogleSignIn = document.getElementById("btnGoogleSignIn");
const googleProfileEl = document.getElementById("googleProfile");
const googleAvatarEl = document.getElementById("googleAvatar");
const googleNameEl = document.getElementById("googleName");
const matchTimerEl = document.getElementById("matchTimer");
const leaderboardListEl = document.getElementById("leaderboardList");
const completionOverlayEl = document.getElementById("completionOverlay");
const completionTimeEl = document.getElementById("completionTime");
const completionNameInput = document.getElementById("completionName");
const completionStatusEl = document.getElementById("completionStatus");
const btnSubmitScore = document.getElementById("btnSubmitScore");
const btnSkipScore = document.getElementById("btnSkipScore");

// =========================================================
// GAME STATE
// =========================================================
let balls = [];
let cue = null;
let pottedThisShot = [];
let scratchedThisShot = false;
let awaitingRespawn = false;

// multiplayer state (null when playing locally)
let mp = null; // { code, playerId, unsubscribe, currentTurn, opponentGone, myName, opponentName }
let net = null; // network module, loaded eagerly at startup (see initNetwork below)

const SLOT_ORDER = ["p1", "p2", "p3", "p4"];
const PLAYER_COLORS = {
  p1: "#E4283C", // red — brand
  p2: "#4DD0FF", // cold blue
  p3: "#7CFF6B", // toxic green
  p4: "#C77DFF", // violet
};

// match timer / completion state
let matchStartTime = null;
let matchElapsedFrozen = null;
let gameCompleted = false;

// status face (Doom-style reactive portrait)
let faceState = "idle";
let faceLockUntil = 0;
let faceFinal = null; // "victory" | "defeat" once the match is decided — overrides everything else
let lastShotWasMine = true; // who most recently potted/missed — decides victory vs defeat face

function setFace(state, holdMs) {
  faceState = state;
  faceLockUntil = holdMs ? performance.now() + holdMs : 0;
  const src = `assets/face-${state}.png`;
  if (statusFaceImgEl.getAttribute("src") !== src) statusFaceImgEl.src = src;
}

function updateFaceColor() {
  statusFaceEl.classList.remove("player-p1", "player-p2");
  if (mp) statusFaceEl.classList.add(mp.playerId === "p1" ? "player-p1" : "player-p2");
}

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
  scratchedThisShot = false;
  firstContactBall = null;
  awaitingRespawn = false;
  matchStartTime = performance.now();
  matchElapsedFrozen = null;
  gameCompleted = false;
  faceFinal = null;
  setFace("idle");
  updateFaceColor();
  settleWatcher.reset();
  groupLineEl.classList.add("hidden");
  foulLineEl.classList.add("hidden");
  if (mp) mp.groups = {};
  completionOverlayEl.classList.add("hidden");
  updateBallsLeft();
}

function ballsRemaining() {
  return balls.filter((b) => !b.potted && !b.isCue).length;
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function updateBallsLeft() {
  ballsLeftEl.textContent = String(ballsRemaining());
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
    scratchedThisShot = true;
    return;
  }
  playPot();
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
  if (!cue || cue.potted || !isSettled(balls) || gameCompleted) return false;
  if (mp) return mp.currentTurn === mp.playerId && !mp.opponentGone;
  return true;
}

function applyGameOver(gameOver) {
  if (!gameOver || !mp || gameCompleted) return;
  gameCompleted = true;
  matchElapsedFrozen = performance.now() - matchStartTime;
  const iWon = gameOver.winner === mp.playerId;
  faceFinal = iWon ? "victory" : "defeat";
  setFace(faceFinal);
  turnIndicatorEl.textContent = iWon ? "¡has ganado!" : "has perdido";
  turnIndicatorEl.className = "turn-indicator " + (iWon ? "my-turn" : "their-turn");
  foulLineEl.classList.remove("hidden");
  foulLineEl.textContent = gameOver.reason || "";
}

const input = createInput(
  canvas,
  () => cue,
  canShootNow,
  (vx, vy) => {
    cue.vx = vx;
    cue.vy = vy;
    playStrike(Math.min(1, Math.hypot(vx, vy) / MAX_SHOT_SPEED));
    scratchedThisShot = false;
    firstContactBall = null;
    foulLineEl.classList.add("hidden");
    settleWatcher.armForLocalShot(true);
    if (mp) {
      net.sendShot(mp.code, mp.playerId, vx, vy);
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
  let waitStartedAt = 0;
  const MAX_WAIT_MS = 10000; // safety net — force-settle if physics never fully decays

  return {
    armForLocalShot(authoritative) {
      waitingForLocalSettle = true;
      isAuthoritative = authoritative;
      waitStartedAt = performance.now();
    },
    reset() {
      waitingForLocalSettle = false;
    },
    tick() {
      if (!waitingForLocalSettle) return;

      if (performance.now() - waitStartedAt > MAX_WAIT_MS) {
        // extremely rare — a ball kept re-colliding without ever fully decaying.
        // snap everything to rest so the game can't get stuck forever.
        balls.forEach((b) => { b.vx = 0; b.vy = 0; });
      }

      if (!isSettled(balls) || awaitingRespawn) return;
      waitingForLocalSettle = false;

      if (!isAuthoritative) {
        // just replaying the opponent's shot locally — react from my side of the table,
        // then let them own the correction/turn-pass
        lastShotWasMine = false;
        if (pottedThisShot.length > 0) setFace("hurt", 1400); // they scored — bad for me
        else setFace("happy", 1400); // they whiffed — good for me
        pottedThisShot = [];
        return;
      }

      lastShotWasMine = true;

      if (!mp) {
        if (pottedThisShot.length > 0) setFace("happy", 1400);
        else setFace("hurt", 1400);
        pottedThisShot = [];
        return;
      }

      if (classicRulesActive()) {
        const potted = pottedThisShot.slice();
        pottedThisShot = [];
        const eightPotted = potted.some((b) => b.number === 8);
        const nonEightPotted = potted.filter((b) => b.number !== 8);
        const myGroup = mp.groups[mp.playerId] || null;

        let foul = false;
        let foulReason = "";
        if (scratchedThisShot) {
          foul = true;
          foulReason = "bola blanca colada";
        } else if (!firstContactBall) {
          foul = true;
          foulReason = "no has tocado ninguna bola";
        } else {
          const contactGroup = ballGroup(firstContactBall);
          if (contactGroup === "eight") {
            const groupCleared = myGroup && remainingInGroup(myGroup) === 0;
            if (!groupCleared) {
              foul = true;
              foulReason = "has tocado la bola 8 antes de tiempo";
            }
          } else if (myGroup && contactGroup !== myGroup) {
            foul = true;
            foulReason = "has tocado una bola que no es tuya";
          }
        }

        let groupsChanged = false;
        if (!myGroup && !foul && nonEightPotted.length > 0) {
          const newGroup = ballGroup(nonEightPotted[0]);
          const otherSlot = activeSlots().find((s) => s !== mp.playerId);
          mp.groups = { ...mp.groups, [mp.playerId]: newGroup, [otherSlot]: newGroup === "solid" ? "stripe" : "solid" };
          groupsChanged = true;
        }

        const snapshot = () =>
          balls.map((b) => ({ x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100, potted: b.potted }));

        if (eightPotted) {
          const myGroupNow = mp.groups[mp.playerId] || null;
          const legalWin = !foul && myGroupNow && remainingInGroup(myGroupNow) === 0;
          const otherSlot = activeSlots().find((s) => s !== mp.playerId);
          const winner = legalWin ? mp.playerId : otherSlot;
          const reason = legalWin ? null : foul ? foulReason : "metiste la bola 8 antes de tiempo";
          const gameOver = { winner, reason, ts: Date.now() };

          net.sendCorrection(mp.code, mp.playerId, snapshot(), mp.currentTurn, {
            groups: groupsChanged ? mp.groups : undefined,
            gameOver,
          });
          applyGameOver(gameOver);
          return;
        }

        setFace(foul ? "hurt" : nonEightPotted.length > 0 ? "happy" : "hurt", 1400);

        if (foul) {
          foulLineEl.classList.remove("hidden");
          foulLineEl.textContent = `falta — ${foulReason}`;
        } else {
          foulLineEl.classList.add("hidden");
        }

        const continueShooting = !foul && nonEightPotted.some((b) => !myGroup || ballGroup(b) === myGroup);
        const nextTurn = continueShooting ? mp.playerId : nextActiveTurn(mp.playerId);
        mp.currentTurn = nextTurn;

        if (foul) placeCueAtKitchen();

        net.sendCorrection(mp.code, mp.playerId, snapshot(), nextTurn, {
          groups: groupsChanged ? mp.groups : undefined,
          foul: foul ? { by: mp.playerId, reason: foulReason, ts: Date.now() } : null,
        });
        updateTurnUI();
        return;
      }

      // 3-4 player games — no groups/fouls, simple points-per-ball scoring
      const gained = pottedThisShot.filter((b) => b.number !== 8).length;
      if (pottedThisShot.length > 0) setFace("happy", 1400);
      else setFace("hurt", 1400);

      const nextTurn = nextActiveTurn(mp.playerId);
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

function activeSlots() {
  return SLOT_ORDER.filter((s) => mp?.players?.[s]);
}

function ballGroup(ball) {
  if (ball.number === 8) return "eight";
  return ball.number < 8 ? "solid" : "stripe";
}

function remainingInGroup(group) {
  return balls.filter((b) => !b.potted && !b.isCue && ballGroup(b) === group).length;
}

function classicRulesActive() {
  return !!mp && activeSlots().length === 2;
}

function groupLabel(group) {
  if (group === "solid") return "lisas";
  if (group === "stripe") return "rayadas";
  return "";
}

function placeCueAtKitchen() {
  cue.potted = false;
  cue.x = PLAY_LEFT + (PLAY_RIGHT - PLAY_LEFT) * 0.22;
  cue.y = (PLAY_TOP + PLAY_BOTTOM) / 2;
  cue.vx = 0;
  cue.vy = 0;
}

function nextActiveTurn(fromSlot) {
  const active = activeSlots();
  if (active.length === 0) return fromSlot;
  const i = active.indexOf(fromSlot);
  return active[(i + 1) % active.length];
}

function updateTurnUI() {
  if (!mp) return;
  if (gameCompleted) {
    renderWaitingSkulls();
    return;
  }
  if (mp.opponentGone) {
    turnIndicatorEl.textContent = "esperando jugadores…";
    turnIndicatorEl.className = "turn-indicator";
  } else {
    const myTurn = mp.currentTurn === mp.playerId;
    const shooterName = mp.players?.[mp.currentTurn]?.name || "otro jugador";
    turnIndicatorEl.textContent = myTurn ? "tu turno" : `turno de ${shooterName}`;
    turnIndicatorEl.className = "turn-indicator " + (myTurn ? "my-turn" : "their-turn");
  }

  if (classicRulesActive() && mp.groups[mp.playerId]) {
    groupLineEl.classList.remove("hidden");
    groupLineEl.textContent = `// vas de ${groupLabel(mp.groups[mp.playerId])}`;
  } else {
    groupLineEl.classList.add("hidden");
  }

  renderWaitingSkulls();
}

function updateScoreUI(scores) {
  if (!scores || !mp) return;
  const parts = activeSlots().map((slot) => {
    const label = slot === mp.playerId ? mp.myName || "tú" : mp.players[slot]?.name || slot;
    return `${label}: ${scores[slot] || 0}`;
  });
  scoreLineEl.textContent = parts.join("  ·  ");
}

function renderWaitingSkulls() {
  const container = waitingSkullsEl;
  if (!mp) {
    container.classList.add("hidden");
    return;
  }
  container.classList.remove("hidden");

  const waiting = new Set(activeSlots().filter((s) => s !== mp.playerId && s !== mp.currentTurn));

  SLOT_ORDER.forEach((slot) => {
    const el = document.getElementById(`wait${slot.toUpperCase()}`);
    if (waiting.has(slot)) {
      el.classList.remove("hidden");
      el.querySelector(".waiting-skull-name").textContent = mp.players[slot]?.name || slot;
    } else {
      el.classList.add("hidden");
    }
  });
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
// MATCH COMPLETION + LEADERBOARD
// =========================================================
function checkGameCompletion() {
  if (gameCompleted || balls.length === 0 || matchStartTime === null) return;
  if (ballsRemaining() > 0) return;
  if (!isSettled(balls) || awaitingRespawn) return;

  gameCompleted = true;
  faceFinal = !mp || lastShotWasMine ? "victory" : "defeat";
  setFace(faceFinal);
  matchElapsedFrozen = performance.now() - matchStartTime;
  completionTimeEl.textContent = formatTime(matchElapsedFrozen);
  completionStatusEl.textContent = "";
  completionNameInput.value = (net && net.getProfile()?.name) || mp?.myName || "";
  btnSubmitScore.disabled = false;
  completionOverlayEl.classList.remove("hidden");
}

btnSubmitScore.addEventListener("click", async () => {
  btnSubmitScore.disabled = true;
  completionStatusEl.textContent = "Guardando…";
  completionStatusEl.className = "lobby-status";
  try {
    await initNetwork();
    await net.submitScore(completionNameInput.value, matchElapsedFrozen);
    completionStatusEl.textContent = "¡Guardado en el ranking!";
    setTimeout(() => completionOverlayEl.classList.add("hidden"), 1100);
  } catch (e) {
    console.error(e);
    completionStatusEl.textContent = "No se pudo guardar. Inténtalo de nuevo.";
    completionStatusEl.className = "lobby-status error";
    btnSubmitScore.disabled = false;
  }
});

btnSkipScore.addEventListener("click", () => {
  completionOverlayEl.classList.add("hidden");
});

function renderLeaderboard(rows) {
  if (!rows || rows.length === 0) {
    leaderboardListEl.innerHTML = '<li class="leaderboard-empty">Todavía no hay tiempos. ¡Sé el primero!</li>';
    return;
  }
  leaderboardListEl.innerHTML = rows
    .map(
      (r, i) => `
      <li>
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-name">${escapeHtml(r.name || "Jugador")}</span>
        <span class="lb-time mono">${formatTime(r.timeMs)}</span>
      </li>`
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// =========================================================
// NETWORK MODULE — loaded eagerly (needed for the global
// leaderboard even in local single-player mode), but failures
// degrade gracefully instead of breaking the whole page.
// =========================================================
let netReadyPromise = null;
function initNetwork() {
  if (!netReadyPromise) {
    netReadyPromise = import("./network.js")
      .then((mod) => {
        net = mod;
        return mod;
      })
      .catch((e) => {
        console.error(e);
        leaderboardListEl.innerHTML = '<li class="leaderboard-empty">Ranking no disponible ahora mismo.</li>';
        throw e;
      });
  }
  return netReadyPromise;
}

initNetwork()
  .then(() => net.listenLeaderboard(renderLeaderboard))
  .catch(() => {});

const COLLISION_SOUND_MIN_SPEED = 25;
let firstContactBall = null; // which ball the cue touched first this shot — needed for foul detection

function onCollisionSound(kind, impactSpeed, a, b) {
  if (kind === "ball") {
    if (a && b && !firstContactBall) {
      if (a.isCue && !b.isCue) firstContactBall = b;
      else if (b.isCue && !a.isCue) firstContactBall = a;
    }
    if (impactSpeed > COLLISION_SOUND_MIN_SPEED) playBallHit(impactSpeed);
  } else if (impactSpeed > COLLISION_SOUND_MIN_SPEED) {
    playCushionHit(impactSpeed);
  }
}

// =========================================================
// MAIN LOOP
// =========================================================
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;

  stepPhysics(balls, dt, onPot, onCollisionSound);
  respawnCueIfNeeded();
  settleWatcher.tick();

  if (matchStartTime !== null) {
    matchTimerEl.textContent = gameCompleted
      ? formatTime(matchElapsedFrozen)
      : formatTime(performance.now() - matchStartTime);
  }
  checkGameCompletion();

  drawTable(ctx);
  for (const b of balls) b.draw(ctx);
  drawAim(ctx, cue, input, mp ? PLAYER_COLORS[mp.playerId] : "#caa06a");

  powerFillEl.style.width = `${Math.round(input.power * 100)}%`;

  if (faceFinal) {
    if (faceState !== faceFinal) setFace(faceFinal);
  } else if (performance.now() >= faceLockUntil) {
    setFace(input.dragging ? "aiming" : "idle");
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.__debug2 = () => ({
  mpPlayerId: mp?.playerId,
  currentTurn: mp?.currentTurn,
  opponentGone: mp?.opponentGone,
  canShoot: canShootNow(),
  cueSpeed: cue ? Math.hypot(cue.vx, cue.vy) : null,
  cuePos: cue ? { x: Math.round(cue.x), y: Math.round(cue.y) } : null,
  players: mp?.players,
});

// =========================================================
// MODE SELECT / LOBBY WIRING
// =========================================================
document.getElementById("btnLocal").addEventListener("click", () => {
  mp = null;
  mpStatusBlockEl.classList.add("hidden");
  waitingSkullsEl.classList.add("hidden");
  resetBtn.classList.remove("hidden");
  leaveRoomBtn.classList.add("hidden");
  newGame();
  screen("game");
});

document.getElementById("btnMultiplayer").addEventListener("click", async () => {
  screen("mpLobby");
  lobbyStatusEl.textContent = "Cargando…";
  lobbyStatusEl.className = "lobby-status";
  try {
    await initNetwork();
    lobbyStatusEl.textContent = "";
    showGoogleProfile(net.getProfile());
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
    mp = { code, playerId, currentTurn: "p1", myScore: 0, rackOrderShared: rackOrder, opponentGone: false, myName: name, opponentName: null, players: { [playerId]: { name } }, lastScores: null, groups: {} };
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
    mp = { code: roomCode, playerId, currentTurn: "p1", myScore: 0, rackOrderShared: rackOrder, opponentGone: false, myName: name, opponentName: null, players: { [playerId]: { name } }, lastScores: null, groups: {} };
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
  waitingSkullsEl.classList.add("hidden");
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
      scratchedThisShot = false;
      firstContactBall = null;
      settleWatcher.armForLocalShot(false);
    },
    onCorrection: (correction) => {
      if (!correction || correction.by === mp.playerId) return;
      applyCorrection(correction.balls);
    },
    onPlayers: (players) => {
      if (!players) return;
      mp.players = players;

      const stillHaveOthers = SLOT_ORDER.some((s) => s !== mp.playerId && players[s]);
      if (mp.opponentGone && stillHaveOthers) mp.opponentGone = false;
      if (!stillHaveOthers) mp.opponentGone = true;

      updateTurnUI();
      if (mp.lastScores) updateScoreUI(mp.lastScores);
    },
    onGroups: (groups) => {
      if (!groups) return;
      mp.groups = groups;
      updateTurnUI();
    },
    onFoul: (foul) => {
      if (!foul || foul.by === mp.playerId) return;
      foulLineEl.classList.remove("hidden");
      foulLineEl.textContent = `${mp.players?.[foul.by]?.name || "tu rival"} — falta: ${foul.reason}`;
    },
    onGameOver: (gameOver) => applyGameOver(gameOver),
  });
}

document.getElementById("btnTitleContinue").addEventListener("click", () => {
  clearInterval(titleMouthTimer);
  titleScreenEl.classList.add("hidden");
  screen("modeSelect");
});
