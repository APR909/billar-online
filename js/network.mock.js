// TEST-ONLY MOCK — simulates the real network.js API using localStorage +
// storage events (shared across tabs in the same browser context), so the
// multiplayer flow can be tested without touching the real Firebase project.
// Not used by the game (main.js imports "./network.js"); kept here so you
// can swap it back in for quick local testing later if you want.
import { generateRackOrder } from "./rack.js";

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
  writeRoom(code, { status: "waiting", turn: "p1", players: { p1: true }, scores: { p1: 0, p2: 0 }, rackOrder });
  return { code, playerId: "p1", rackOrder };
}

export async function joinRoom(codeRaw) {
  const code = codeRaw.trim().toUpperCase();
  const room = readRoom(code);
  if (!room) throw new Error("Esa sala no existe.");
  if (room.players.p2) throw new Error("Esa sala ya está completa.");
  room.players.p2 = true;
  room.status = "playing";
  writeRoom(code, room);
  window.dispatchEvent(new StorageEvent("storage", { key: key(code) }));
  return { code, playerId: "p2", rackOrder: room.rackOrder };
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
