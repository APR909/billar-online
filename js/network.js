// ============================================================
// REAL MULTIPLAYER NETWORK LAYER — Firebase Realtime Database
//
// Same API surface as network.mock.js (already tested against
// main.js), so main.js needs zero changes to the core game flow.
// Added on top: optional Google sign-in so a player's real name
// shows up instead of "Jugador 1" / "Jugador 2". Anonymous auth
// is still the fallback — signing in with Google is never required.
//
//   createRoom() -> { code, playerId, rackOrder, name }
//   joinRoom(code) -> { code, playerId, rackOrder, name }
//   listenRoom(code, callbacks) -> unsubscribe()
//   sendShot(code, playerId, vx, vy)
//   sendCorrection(code, playerId, balls, nextTurn, scoreDelta)
//   leaveRoom(code, playerId)
//   signInWithGoogle() -> { name, photo }
//   getProfile() -> { name, photo } | null   (null = playing as guest)
//   submitScore(name, timeMs)
//   listenLeaderboard(callback, max) -> unsubscribe()
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
  GoogleAuthProvider,
  signInWithPopup,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  update,
  get,
  push,
  query,
  orderByChild,
  limitToFirst,
  onValue,
  remove,
  onDisconnect,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let uidPromise = null;
function ensureSignedIn() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser.uid);
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

// ---------- Google sign-in (optional) ----------
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  uidPromise = Promise.resolve(result.user.uid); // keep ensureSignedIn() in sync
  return { name: result.user.displayName, photo: result.user.photoURL };
}

export function getProfile() {
  const u = auth.currentUser;
  if (!u || u.isAnonymous) return null;
  return { name: u.displayName, photo: u.photoURL };
}

function myDisplayName(fallback) {
  const profile = getProfile();
  return profile?.name || fallback;
}

// ---------- rooms ----------
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
  const name = myDisplayName("Jugador 1");

  await set(roomRef(code), {
    status: "waiting",
    turn: "p1",
    players: { p1: { name } },
    scores: { p1: 0, p2: 0 },
    rackOrder,
    createdAt: Date.now(),
  });

  onDisconnect(ref(db, `rooms/${code}/players/p1`)).remove();

  return { code, playerId: "p1", rackOrder, name };
}

export async function joinRoom(codeRaw) {
  await ensureSignedIn();
  const code = codeRaw.trim().toUpperCase();
  const snap = await get(roomRef(code));

  if (!snap.exists()) throw new Error("Esa sala no existe.");
  const room = snap.val();
  if (room.players?.p2) throw new Error("Esa sala ya está completa.");

  const name = myDisplayName("Jugador 2");
  await update(ref(db, `rooms/${code}/players`), { p2: { name } });
  await update(roomRef(code), { status: "playing" });
  onDisconnect(ref(db, `rooms/${code}/players/p2`)).remove();

  return { code, playerId: "p2", rackOrder: room.rackOrder, name };
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

// ---------- leaderboard ----------
export async function submitScore(name, timeMs) {
  await ensureSignedIn();
  const cleanName = (name || "Jugador").trim().slice(0, 24) || "Jugador";
  await set(push(ref(db, "leaderboard")), {
    name: cleanName,
    timeMs: Math.round(timeMs),
    createdAt: Date.now(),
  });
}

export function listenLeaderboard(callback, max = 10) {
  const q = query(ref(db, "leaderboard"), orderByChild("timeMs"), limitToFirst(max));
  const unsub = onValue(q, (snap) => {
    const rows = [];
    snap.forEach((child) => rows.push({ id: child.key, ...child.val() }));
    rows.sort((a, b) => a.timeMs - b.timeMs);
    callback(rows);
  });
  return unsub;
}
