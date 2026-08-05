// ============================================================
// REAL MULTIPLAYER NETWORK LAYER — Firebase Realtime Database
//
// Same API surface as network.mock.js (already tested against
// main.js), so main.js needs zero changes:
//   createRoom() -> { code, playerId, rackOrder }
//   joinRoom(code) -> { code, playerId, rackOrder }
//   listenRoom(code, callbacks) -> unsubscribe()
//   sendShot(code, playerId, vx, vy)
//   sendCorrection(code, playerId, balls, nextTurn, scoreDelta)
//   leaveRoom(code, playerId)
//
// Sync model: turn-based, so we never stream continuous ball
// positions. The shooter simulates locally and writes {vx, vy}
// once; the other client replays that exact shot with the same
// physics code. Once the shooter's simulation settles, it writes
// the authoritative resting positions, and the other client snaps
// to them (silently correcting any tiny floating-point drift).
// ============================================================

import { firebaseConfig } from "./firebase-config.js";
import { generateRackOrder } from "./rack.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  update,
  get,
  onValue,
  remove,
  onDisconnect,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let uidPromise = null;
function ensureSignedIn() {
  if (!uidPromise) {
    uidPromise = new Promise((resolve, reject) => {
      const unsub = onAuthStateChanged(
        auth,
        (user) => {
          if (user) {
            unsub();
            resolve(user.uid);
          }
        },
        reject
      );
      signInAnonymously(auth).catch(reject);
    });
  }
  return uidPromise;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 (ambiguous)
function randomCode(len = 5) {
  let c = "";
  for (let i = 0; i < len; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

function roomRef(code) {
  return ref(db, `rooms/${code}`);
}

export async function createRoom() {
  await ensureSignedIn();
  const code = randomCode();
  const rackOrder = generateRackOrder();

  await set(roomRef(code), {
    status: "waiting",
    turn: "p1",
    players: { p1: true },
    scores: { p1: 0, p2: 0 },
    rackOrder,
    createdAt: Date.now(),
  });

  onDisconnect(ref(db, `rooms/${code}/players/p1`)).remove();

  return { code, playerId: "p1", rackOrder };
}

export async function joinRoom(codeRaw) {
  await ensureSignedIn();
  const code = codeRaw.trim().toUpperCase();
  const snap = await get(roomRef(code));

  if (!snap.exists()) throw new Error("Esa sala no existe.");
  const room = snap.val();
  if (room.players?.p2) throw new Error("Esa sala ya está completa.");

  await update(ref(db, `rooms/${code}/players`), { p2: true });
  await update(roomRef(code), { status: "playing" });
  onDisconnect(ref(db, `rooms/${code}/players/p2`)).remove();

  return { code, playerId: "p2", rackOrder: room.rackOrder };
}

export function listenRoom(code, callbacks) {
  let lastShotTs = null;
  let lastCorrectionTs = null;

  const unsub = onValue(roomRef(code), (snap) => {
    const room = snap.val();
    if (!room) return;

    callbacks.onStatus?.(room.status);
    callbacks.onTurn?.(room.turn);
    callbacks.onScores?.(room.scores);
    callbacks.onPlayers?.(room.players);

    if (room.shot && room.shot.ts !== lastShotTs) {
      lastShotTs = room.shot.ts;
      callbacks.onShot?.(room.shot);
    }
    if (room.correction && room.correction.ts !== lastCorrectionTs) {
      lastCorrectionTs = room.correction.ts;
      callbacks.onCorrection?.(room.correction);
    }
  });

  return unsub;
}

export function sendShot(code, playerId, vx, vy) {
  return update(roomRef(code), {
    shot: { by: playerId, vx, vy, ts: Date.now() },
  });
}

export function sendCorrection(code, playerId, balls, nextTurn, scoreDelta) {
  const updates = {
    correction: { by: playerId, balls, ts: Date.now() },
    turn: nextTurn,
  };
  if (scoreDelta) updates[`scores/${playerId}`] = scoreDelta.newScore;
  return update(roomRef(code), updates);
}

export async function leaveRoom(code, playerId) {
  try {
    await remove(ref(db, `rooms/${code}/players/${playerId}`));
  } catch (e) {
    // room may already be gone — fine to ignore
  }
}
