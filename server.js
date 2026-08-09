// SCHWIMMEN (31) – Deno-Server. Drei Karten auf der Hand, drei offen in der
// Mitte, drei Leben. Gerechnet wird nur hier: der Client bekommt seinen
// eigenen Punktestand fertig ausgerechnet und die fremden erst beim
// Aufdecken.

import { darfRaumOeffnen, raumVermerkt } from "./bremse.js";
import { cleanName, raumverwaltung, shuffle } from "./raum.js";
import { starte } from "./statisch.js";
// Blatt und Punkte liegen in einer eigenen Datei, damit `probe.js` dieselbe
// Rechnung prüfen kann, die hier läuft – nicht eine nachgebaute daneben.
import { auswertung, neuesDeck, punkteVon } from "./karten.js";

const PORT = Number(Deno.env.get("PORT") ?? 8063);
const HOST = Deno.env.get("HOST") ?? "0.0.0.0";
const PUBLIC = new URL("./public/", import.meta.url);

const MAX_PLAYERS = 6;
const MIN_PLAYERS = 2;

const AUFDECK_MS = 7000;

const {
  rooms, browsing,
  createRoom, clearTimers, anwesende,
  send, raw, broadcast,
  roomList, pushState, pushRoomList,
  makePlayer, attach, dropPlayer,
} = raumverwaltung({
  maxPlayers: MAX_PLAYERS,
  minPlayers: MIN_PLAYERS,
  einstellungen: {},
  raumfelder: () => ({
    deck: [], mitte: [], reihe: [], amZug: null, schritt: "zug",
    geklopft: null, geschoben: 0, aufdeckung: null, meldung: null,
  }),
  spielerfelder: () => ({ hand: [], leben: 3, schwimmt: false, drin: false }),

  beimBeitritt: (room) => { if (room.phase === "playing") pushRunde(room); },
  nachVerlassen: (room, player) => {
    if (room.phase === "playing" && room.amZug === player.id) weiterWennWeg(room);
  },
  beimPlatzfrei: (room, id) => {
    if (room.phase !== "playing") return;
    const i = room.reihe.indexOf(id);
    if (i >= 0) room.reihe.splice(i, 1);
    if (room.geklopft === id) room.geklopft = null;
    if (room.reihe.length < 2) return finishGame(room);
    if (room.amZug === id) weiterWennWeg(room);
    pushRunde(room);
  },
  zurueckZurLobby: (room) => backToLobby(room),
});

const name = (room, id) => room.players.get(id)?.name ?? "?";

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------

function startGame(room) {
  clearTimers(room);
  room.phase = "playing";
  room.rundeNr = 0;
  room.reihe = shuffle(anwesende(room).map((p) => p.id));
  for (const p of room.players.values()) {
    p.leben = 3;
    p.schwimmt = false;
    p.drin = room.reihe.includes(p.id);
    p.hand = [];
    p.ready = false;
    p.punkte = 0;
  }
  neueRunde(room, room.reihe[0]);
  pushState(room);
  pushRoomList();
}

function neueRunde(room, ersterId) {
  clearTimers(room);
  room.rundeNr++;
  room.deck = neuesDeck();
  room.mitte = [room.deck.pop(), room.deck.pop(), room.deck.pop()];
  for (const id of room.reihe) {
    room.players.get(id).hand = [room.deck.pop(), room.deck.pop(), room.deck.pop()];
  }
  room.geklopft = null;
  room.geschoben = 0;
  room.aufdeckung = null;
  room.schritt = "zug";
  room.amZug = room.reihe.includes(ersterId) ? ersterId : room.reihe[0];
  room.meldung = null;
  pushRunde(room);
}

function naechster(room, von) {
  if (!room.reihe.length) return null;
  const i = room.reihe.indexOf(von);
  return room.reihe[(i < 0 ? 0 : i + 1) % room.reihe.length];
}

function weiterWennWeg(room) {
  const p = room.players.get(room.amZug);
  if (p?.connected) return;
  zugFertig(room, room.amZug);
}

/** Nach jedem Zug: hat der Klopfer wieder das Wort, wird aufgedeckt. */
function zugFertig(room, vonId) {
  const naechsteId = naechster(room, vonId);
  if (room.geklopft && naechsteId === room.geklopft) return aufdecken(room);
  room.amZug = naechsteId;
  pushRunde(room);
}

function aufdecken(room) {
  room.schritt = "aufdecken";
  const stand = room.reihe.map((id) => {
    const p = room.players.get(id);
    return { id, name: p.name, hand: [...p.hand], punkte: punkteVon(p.hand) };
  });
  // 31 oder Drilling ist Feuer: dann verlieren alle anderen ein Leben.
  const { feuer, verlierer } = auswertung(stand);
  room.meldung = feuer.length
    ? `${feuer.map((f) => f.name).join(", ")} hat Feuer!`
    : `${verlierer.map((v) => v.name).join(", ")} hat am wenigsten.`;

  const raus = [];
  for (const v of verlierer) {
    const p = room.players.get(v.id);
    if (!p) continue;
    if (p.schwimmt) {
      p.drin = false;
      raus.push(p.name);
    } else if (p.leben > 1) {
      p.leben--;
    } else {
      p.leben = 0;
      p.schwimmt = true;
    }
  }

  room.aufdeckung = {
    stand: stand.map((s) => ({
      name: s.name,
      hand: s.hand,
      punkte: s.punkte,
      verliert: verlierer.some((v) => v.id === s.id),
    })),
    meldung: room.meldung,
    raus,
  };
  pushRunde(room);

  for (const n of raus) {
    const id = room.reihe.find((x) => name(room, x) === n);
    const i = room.reihe.indexOf(id);
    if (i >= 0) room.reihe.splice(i, 1);
  }

  const naechsterErster = naechster(room, room.amZug);
  const id = setTimeout(() => {
    room.timers.delete(id);
    if (room.reihe.length < 2) return finishGame(room);
    neueRunde(room, naechsterErster ?? room.reihe[0]);
  }, AUFDECK_MS);
  room.timers.add(id);
}

function pushRunde(room) {
  if (room.phase !== "playing") return;
  const spieler = room.reihe.map((id) => {
    const p = room.players.get(id);
    return {
      id, name: p?.name ?? "?", leben: p?.leben ?? 0, schwimmt: !!p?.schwimmt,
      weg: !p?.connected, klopft: room.geklopft === id,
    };
  });
  for (const p of room.players.values()) {
    send(p, {
      t: "runde",
      n: room.rundeNr,
      schritt: room.schritt,
      amZug: room.amZug,
      amZugName: name(room, room.amZug),
      mitte: room.mitte,
      hand: p.hand,
      meine: punkteVon(p.hand),
      dabei: !!p.drin,
      geklopft: room.geklopft ? name(room, room.geklopft) : null,
      spieler,
      aufdeckung: room.aufdeckung,
      meldung: room.meldung,
    });
  }
}

function finishGame(room) {
  clearTimers(room);
  room.phase = "final";
  const tabelle = [
    ...room.reihe.map((id) => {
      const p = room.players.get(id);
      return {
        name: p?.name ?? "?",
        wert: p?.schwimmt ? "schwimmt noch" : `${p?.leben} Leben übrig`,
        punkte: 100 + (p?.leben ?? 0),
      };
    }),
    ...[...room.players.values()].filter((p) => p.hand.length && !room.reihe.includes(p.id))
      .map((p) => ({ name: p.name, wert: "abgesoffen", punkte: 0 })),
  ].sort((a, b) => b.punkte - a.punkte);
  for (const p of room.players.values()) p.ready = false;
  broadcast(room, {
    t: "final",
    tabelle,
    untertitel: room.reihe.length === 1
      ? `${name(room, room.reihe[0])} bleibt über Wasser.`
      : `${room.rundeNr} Runden gespielt`,
  });
  pushState(room);
  pushRoomList();
}

function backToLobby(room) {
  clearTimers(room);
  room.phase = "lobby";
  room.rundeNr = 0;
  room.reihe = [];
  room.mitte = [];
  room.deck = [];
  room.geklopft = null;
  room.aufdeckung = null;
  room.meldung = null;
  for (const p of room.players.values()) {
    p.ready = false;
    p.hand = [];
    p.leben = 3;
    p.schwimmt = false;
    p.drin = false;
  }
  pushState(room);
}

// ---------------------------------------------------------------------------
// Nachrichten
// ---------------------------------------------------------------------------

function handle(ws, msg) {
  const room = ws._room;
  const player = ws._player;

  if (msg.t === "ping") return raw(ws, { t: "pong", c: msg.c, s: Date.now() });

  if (msg.t === "browse") {
    if (!ws._room) {
      browsing.add(ws);
      raw(ws, { t: "rooms", rooms: roomList() });
    }
    return;
  }

  if (msg.t === "create") {
    if (room) return;
    if (!darfRaumOeffnen(ws._ip)) {
      return raw(ws, { t: "error", msg: "Zu viele Räume in kurzer Zeit. Warte kurz." });
    }
    raumVermerkt(ws._ip);
    const r = createRoom(msg.isPublic);
    const p = makePlayer(msg.name, true);
    r.hostId = p.id;
    r.players.set(p.id, p);
    attach(ws, r, p);
    pushState(r);
    pushRoomList();
    return;
  }

  if (msg.t === "join") {
    if (room) return;
    const r = rooms.get(String(msg.code ?? "").toUpperCase().trim());
    if (!r) return raw(ws, { t: "error", msg: "Diesen Raum gibt es nicht" });
    if (msg.token) {
      const back = [...r.players.values()].find((p) => p.token === msg.token);
      if (back) {
        if (back.ws && back.ws !== ws && back.ws.readyState === WebSocket.OPEN) {
          try { back.ws.close(4001, "woanders geöffnet"); } catch { /* egal */ }
        }
        attach(ws, r, back);
        pushState(r);
        return;
      }
    }
    if (r.players.size >= MAX_PLAYERS) {
      return raw(ws, { t: "error", msg: `Der Raum ist voll (${MAX_PLAYERS} Spieler)` });
    }
    if (r.phase !== "lobby") return raw(ws, { t: "error", msg: "Die Runde läuft schon" });
    const p = makePlayer(msg.name, false);
    r.players.set(p.id, p);
    attach(ws, r, p);
    pushState(r);
    return;
  }

  if (!room || !player) return;
  room.lastActivity = Date.now();

  const dran = room.phase === "playing" && room.schritt === "zug" && room.amZug === player.id;

  switch (msg.t) {
    case "name":
      player.name = cleanName(msg.name);
      pushState(room);
      pushRunde(room);
      break;

    case "ready":
      player.ready = !!msg.value;
      pushState(room);
      break;

    case "settings":
      if (player.id !== room.hostId || room.phase !== "lobby") break;
      if (typeof msg.isPublic === "boolean") room.isPublic = msg.isPublic;
      pushState(room);
      pushRoomList();
      break;

    case "start": {
      if (player.id !== room.hostId || room.phase !== "lobby") break;
      const da = anwesende(room);
      if (da.length < MIN_PLAYERS) break;
      if (!da.every((p) => p.ready || p.id === room.hostId)) break;
      startGame(room);
      break;
    }

    case "tausch1": {
      if (!dran) break;
      const h = Number(msg.hand), m = Number(msg.mitte);
      if (!player.hand[h] || !room.mitte[m]) break;
      [player.hand[h], room.mitte[m]] = [room.mitte[m], player.hand[h]];
      room.geschoben = 0;
      room.meldung = `${player.name} tauscht eine Karte.`;
      zugFertig(room, player.id);
      break;
    }

    case "tausch3": {
      if (!dran) break;
      const alt = player.hand;
      player.hand = room.mitte;
      room.mitte = alt;
      room.geschoben = 0;
      room.meldung = `${player.name} tauscht alle drei.`;
      zugFertig(room, player.id);
      break;
    }

    case "schieben": {
      if (!dran) break;
      room.geschoben++;
      room.meldung = `${player.name} schiebt.`;
      // Schieben alle reihum, kommen drei neue Karten in die Mitte.
      if (room.geschoben >= room.reihe.length) {
        if (room.deck.length >= 3) {
          room.mitte = [room.deck.pop(), room.deck.pop(), room.deck.pop()];
          room.meldung = "Alle haben geschoben – neue Karten in der Mitte.";
        }
        room.geschoben = 0;
      }
      zugFertig(room, player.id);
      break;
    }

    case "klopfen": {
      if (!dran || room.geklopft) break;
      room.geklopft = player.id;
      room.meldung = `${player.name} klopft – alle anderen haben noch einen Zug.`;
      zugFertig(room, player.id);
      break;
    }

    case "ende":
      if (player.id !== room.hostId || room.phase !== "playing") break;
      finishGame(room);
      break;

    case "again":
      if (player.id !== room.hostId || room.phase !== "final") break;
      backToLobby(room);
      break;

    case "leave":
      dropPlayer(ws, { immediate: true });
      break;
  }
}

starte({ port: PORT, host: HOST, publicDir: PUBLIC, titel: "SCHWIMMEN", handle, dropPlayer });
