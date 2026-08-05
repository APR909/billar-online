// TEST-ONLY MOCK — simulates the real network.js API using localStorage +
// storage events (shared across tabs in the same browser context), so the
// multiplayer flow can be tested without a real Firebase project.
import { generateRackOrder } from "./rack.js";

let mockProfile = null;
export async function signInWithGoogle() {
  mockProfile = { name: "Jugador de prueba", photo: "" };
  return mockProfile;
}
export function getProfile() {
  return mockProfile;
}
function myDisplayName(fallback) {
  return mockProfile?.name || fallback;
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len = 5) {
  let c = "";
  for (let i = 0; i < len; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}
function key(code) { return "mockroom_" + code; }
function readRoom(code) { const raw = localStorage.getItem(key(code)); return raw ? JSON.parse(raw) : null; }
function writeRoom(code, data) { localStorage.setItem(key(code), JSON.stringify(data)); }

export async function createRoom() {
  const code = randomCode();
  const rackOrder = generateRackOrder();
  const name = myDisplayName("Jugador 1");
  writeRoom(code, { status: "waiting", turn: "p1", players: { p1: { name } }, scores: { p1: 0, p2: 0 }, rackOrder });
  return { code, playerId: "p1", rackOrder, name };
}

export async function joinRoom(codeRaw) {
  const code = codeRaw.trim().toUpperCase();
  const room = readRoom(code);
  if (!room) throw new Error("Esa sala no existe.");
  if (room.players.p2) throw new Error("Esa sala ya está completa.");
  const name = myDisplayName("Jugador 2");
  room.players.p2 = { name };
  room.status = "playing";
  writeRoom(code, room);
  window.dispatchEvent(new StorageEvent("storage", { key: key(code) }));
  return { code, playerId: "p2", rackOrder: room.rackOrder, name };
}

export function listenRoom(code, callbacks) {
  const handler = () => {
    const room = readRoom(code);
    if (!room) return;
    callbacks.onStatus?.(room.status);
    callbacks.onTurn?.(room.turn);
    callbacks.onScores?.(room.scores);
    callbacks.onPlayers?.(room.players);
    if (room.shot) callbacks.onShot?.(room.shot);
    if (room.correction) callbacks.onCorrection?.(room.correction);
  };
  window.addEventListener("storage", handler);
  // fire once immediately with current state (mimics Firebase onValue's initial call)
  handler();
  return () => window.removeEventListener("storage", handler);
}

export function sendShot(code, playerId, vx, vy) {
  const room = readRoom(code);
  room.shot = { by: playerId, vx, vy, ts: Date.now() };
  writeRoom(code, room);
  window.dispatchEvent(new StorageEvent("storage", { key: key(code) }));
}

export function sendCorrection(code, playerId, balls, nextTurn, scoreDelta) {
  const room = readRoom(code);
  room.correction = { by: playerId, balls, ts: Date.now() };
  room.turn = nextTurn;
  if (scoreDelta) room.scores[playerId] = scoreDelta.newScore;
  writeRoom(code, room);
  window.dispatchEvent(new StorageEvent("storage", { key: key(code) }));
}

export async function leaveRoom(code, playerId) {
  const room = readRoom(code);
  if (!room) return;
  delete room.players[playerId];
  writeRoom(code, room);
  window.dispatchEvent(new StorageEvent("storage", { key: key(code) }));
}

// ---------- leaderboard ----------
const LB_KEY = "mock_leaderboard";
function readLB() { return JSON.parse(localStorage.getItem(LB_KEY) || "[]"); }
function writeLB(rows) { localStorage.setItem(LB_KEY, JSON.stringify(rows)); }

export async function submitScore(name, timeMs) {
  const rows = readLB();
  rows.push({
    id: String(Date.now()) + Math.random(),
    name: (name || "Jugador").trim().slice(0, 24) || "Jugador",
    timeMs: Math.round(timeMs),
    createdAt: Date.now(),
  });
  writeLB(rows);
  window.dispatchEvent(new StorageEvent("storage", { key: LB_KEY }));
}

export function listenLeaderboard(callback, max = 10) {
  const handler = () => {
    const rows = readLB().sort((a, b) => a.timeMs - b.timeMs).slice(0, max);
    callback(rows);
  };
  window.addEventListener("storage", handler);
  handler();
  return () => window.removeEventListener("storage", handler);
}
