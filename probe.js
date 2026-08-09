// Spielt Schwimmen mit drei Clients durch: Geben, Tauschen (eine und alle
// drei), Schieben mit neuen Karten in der Mitte, Klopfen, Aufdecken, Leben
// verlieren, Abgang mitten im Zug, Endstand, Neustart.
//
// Kein Testrahmen, keine Abhaengigkeit – das Skript wirft, wenn etwas nicht
// stimmt, und schreibt sonst mit, was passiert ist. Der Server muss dafuer
// laufen:
//
//   deno task dev            (in einer zweiten Sitzung)
//   deno task probe
// Gegen die Live-Fassung statt gegen den lokalen Server:
//   WS_URL=wss://inf-zeus.de/schwimmen/ws deno task probe
//
// Die Karten sind zufaellig, also kann die Probe keinen bestimmten Ausgang
// ansagen. Sie rechnet stattdessen mit `karten.js` – derselben Datei, die auch
// der Server benutzt – jede Aufdeckung nach und prueft, dass der Server zum
// selben Ergebnis kommt. Der erste Teil laeuft ganz ohne Server.

import { auswertung, DRILLING, HOECHSTE, neuesDeck, punkteVon } from "./karten.js";

const PORT = Deno.env.get("PORT") ?? "8063";
const URL_WS = Deno.env.get("WS_URL") ?? `ws://127.0.0.1:${PORT}/ws`;

const muss = (bedingung, text) => { if (!bedingung) throw new Error(text); };
const karte = (k) => k.f + k.r;
const blatt = (hand) => hand.map(karte).join(" ");

// --- Erst die Punkte, ohne Server -------------------------------------------

const k = (f, r) => ({ f, r });

muss(punkteVon([k("♥", "A"), k("♥", "10"), k("♥", "K")]) === HOECHSTE,
  "A + 10 + K in einer Farbe müssten 31 sein");
muss(punkteVon([k("♠", "D"), k("♥", "D"), k("♦", "D")]) === DRILLING,
  "Ein Drilling müsste 30,5 zählen");
muss(punkteVon([k("♠", "D"), k("♥", "D"), k("♦", "K")]) === 10,
  "Drei Zehner in drei Farben sind kein Drilling und zählen einzeln");
muss(punkteVon([k("♠", "7"), k("♠", "8"), k("♥", "A")]) === 15,
  "Gezählt wird die beste Farbe, nicht die mit den meisten Karten");
muss(punkteVon([k("♠", "7"), k("♥", "8"), k("♦", "9")]) === 9,
  "Ohne zwei gleiche Farben zählt die höchste einzelne Karte");
console.log("ok  Punkte: 31, Drilling, gemischte Hände");

// Ein Deck ist vollstaendig und doppelt kommt nichts vor.
const deck = neuesDeck();
muss(deck.length === 32, "Ein Skatblatt hat 32 Karten, hier: " + deck.length);
muss(new Set(deck.map(karte)).size === 32, "Im Deck liegt eine Karte doppelt");
console.log("ok  32 verschiedene Karten im Deck");

// Feuer schlaegt alles, auch die zweithöchste Hand.
const probeStand = [
  { name: "a", punkte: 31 },
  { name: "b", punkte: 30 },
  { name: "c", punkte: 20 },
];
const aus = auswertung(probeStand);
muss(aus.feuer.length === 1 && aus.feuer[0].name === "a", "Feuer nicht erkannt");
muss(aus.verlierer.length === 2, "Bei Feuer verlieren alle anderen, nicht nur der Letzte");
const ohneFeuer = auswertung([{ name: "a", punkte: 22 }, { name: "b", punkte: 20 }, {
  name: "c",
  punkte: 20,
}]);
muss(ohneFeuer.verlierer.length === 2, "Bei Gleichstand unten verlieren beide");
console.log("ok  Auswertung: Feuer, Gleichstand am unteren Ende");

// --- Jetzt der Server -------------------------------------------------------

function client(name) {
  const c = {
    name, ws: new WebSocket(URL_WS), you: null, room: null, runde: null,
    final: null, fehler: [],
  };
  c.ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === "joined") c.you = m.you;
    if (m.t === "room") c.room = m;
    if (m.t === "runde") c.runde = m;
    if (m.t === "final") c.final = m;
    if (m.t === "error") c.fehler.push(m.msg);
  };
  c.send = (m) => c.ws.send(JSON.stringify(m));
  c.offen = new Promise((res) => { c.ws.onopen = res; });
  return c;
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function bis(bedingung, was, ms = 12_000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    if (bedingung()) return;
    await warte(25);
  }
  throw new Error("Zeitüberschreitung: " + was);
}

const A = client("Anna"), B = client("Ben"), C = client("Cem");
const alleC = [A, B, C];
await Promise.all(alleC.map((c) => c.offen));

// Nicht oeffentlich: die Probe laeuft auch gegen live, und dort soll kein
// Geisterraum in der Liste stehen.
A.send({ t: "create", name: "Anna", isPublic: false });
await bis(() => A.room, "Raum angelegt");
const code = A.room.code;
console.log("Raum:", code);

B.send({ t: "join", code, name: "Ben" });
C.send({ t: "join", code, name: "Cem" });
await bis(() => A.room.players.length === 3, "drei Spieler");

A.send({ t: "start" });
await warte(150);
muss(A.room.phase === "lobby", "Start ging ohne Bereit durch");
console.log("ok  Start blockiert, solange nicht alle bereit sind");

for (const c of [B, C]) c.send({ t: "ready", value: true });
await bis(() => A.room.players.every((p) => p.ready || p.host), "alle bereit");
A.send({ t: "start" });
await bis(() => alleC.every((c) => c.runde?.hand?.length === 3), "gegeben");

// --- Was gegeben wurde ------------------------------------------------------

const alleKarten = [...alleC.flatMap((c) => c.runde.hand), ...A.runde.mitte].map(karte);
muss(alleKarten.length === 12, "Drei Hände und die Mitte sind zwölf Karten");
muss(new Set(alleKarten).size === 12, "Eine Karte wurde doppelt gegeben: " + alleKarten.join(" "));
console.log("ok  drei mal drei Karten plus drei in der Mitte, keine doppelt");

for (const c of alleC) {
  muss(c.runde.meine === punkteVon(c.runde.hand),
    `${c.name}: Server rechnet ${c.runde.meine}, karten.js ${punkteVon(c.runde.hand)}`);
  muss(c.runde.spieler.length === 3, "Die Spielerliste ist unvollständig");
  muss(c.runde.spieler.every((s) => s.hand === undefined && s.punkte === undefined),
    `${c.name} sieht fremde Karten in der Spielerliste`);
  muss(c.runde.aufdeckung === null, "Vor dem Aufdecken gibt es schon eine Aufdeckung");
  muss(c.runde.spieler.every((s) => s.leben === 3), "Nicht jeder startet mit drei Leben");
}
muss(new Set(alleC.map((c) => JSON.stringify(c.runde.mitte))).size === 1,
  "Die Mitte sieht nicht bei allen gleich aus");
console.log(`ok  jeder sieht nur die eigene Hand, die Mitte sehen alle gleich (${blatt(A.runde.mitte)})`);
console.log("    " + alleC.map((c) => `${c.name} ${blatt(c.runde.hand)} = ${c.runde.meine}`).join(" · "));

// --- Nur wer dran ist, darf etwas tun ---------------------------------------

const amZug = () => alleC.find((c) => c.you === A.runde.amZug);
const nichtAmZug = () => alleC.filter((c) => c.you !== A.runde.amZug);

const mitteVorher = JSON.stringify(A.runde.mitte);
nichtAmZug()[0].send({ t: "tausch1", hand: 0, mitte: 0 });
nichtAmZug()[0].send({ t: "klopfen" });
await warte(200);
muss(JSON.stringify(A.runde.mitte) === mitteVorher, "Wer nicht dran ist, konnte tauschen");
muss(A.runde.geklopft === null, "Wer nicht dran ist, konnte klopfen");
console.log("ok  wer nicht am Zug ist, kann weder tauschen noch klopfen");

// --- Eine Karte tauschen ----------------------------------------------------

let dran = amZug();
const handVor = [...dran.runde.hand], mitteVor = [...dran.runde.mitte];
dran.send({ t: "tausch1", hand: 1, mitte: 2 });
await bis(() => A.runde.amZug !== dran.you, "der Zug ist weiter");

muss(karte(dran.runde.hand[1]) === karte(mitteVor[2]), "Die getauschte Karte kam nicht auf die Hand");
muss(karte(A.runde.mitte[2]) === karte(handVor[1]), "Die abgelegte Karte liegt nicht in der Mitte");
muss(karte(dran.runde.hand[0]) === karte(handVor[0]) && karte(dran.runde.hand[2]) === karte(handVor[2]),
  "Beim Tausch einer Karte haben sich die anderen beiden mitverändert");
muss(dran.runde.meine === punkteVon(dran.runde.hand), "Die Punkte wurden nach dem Tausch nicht neu gerechnet");
console.log(`ok  ${dran.name} tauscht eine Karte, Hand und Mitte stimmen danach`);

// --- Alle drei tauschen -----------------------------------------------------

dran = amZug();
const handVor3 = [...dran.runde.hand], mitteVor3 = [...A.runde.mitte];
dran.send({ t: "tausch3" });
await bis(() => A.runde.amZug !== dran.you, "der Zug ist weiter");
muss(blatt(dran.runde.hand) === blatt(mitteVor3), `Nach „alle drei“ liegt die Mitte nicht auf der Hand`);
muss(blatt(A.runde.mitte) === blatt(handVor3), `Nach „alle drei“ liegt die Hand nicht in der Mitte`);
console.log(`ok  ${dran.name} tauscht alle drei`);

// --- Schieben, bis neue Karten kommen ---------------------------------------

const mitteVorSchieben = blatt(A.runde.mitte);
const gesehen = new Set(alleKarten);
for (let i = 0; i < 3; i++) {
  const d = amZug();
  d.send({ t: "schieben" });
  await bis(() => A.runde.amZug !== d.you, `${d.name} hat geschoben`);
}
muss(blatt(A.runde.mitte) !== mitteVorSchieben,
  "Nach einer Runde Schieben liegen dieselben Karten in der Mitte");
muss(A.runde.mitte.every((x) => !gesehen.has(karte(x))),
  "Die neuen Karten in der Mitte waren schon im Spiel: " + blatt(A.runde.mitte));
console.log(`ok  alle drei schieben, dann kommen drei neue Karten (${blatt(A.runde.mitte)})`);

// --- Klopfen: alle anderen haben noch genau einen Zug -----------------------

const klopfer = amZug();
klopfer.send({ t: "klopfen" });
await bis(() => A.runde.geklopft === klopfer.name, "geklopft");
muss(A.runde.schritt === "zug", "Nach dem Klopfen wurde sofort aufgedeckt");
console.log(`ok  ${klopfer.name} klopft`);

const zweiter = amZug();
zweiter.send({ t: "schieben" });
await bis(() => A.runde.amZug !== zweiter.you, "der Zug ist weiter");
muss(A.runde.schritt === "zug", "Nach einem von zwei Zügen wurde schon aufgedeckt");

amZug().send({ t: "schieben" });
await bis(() => A.runde.schritt === "aufdecken", "aufgedeckt");
console.log("ok  nach dem Klopfen kommt jeder andere noch genau einmal dran");

// --- Die Aufdeckung nachrechnen ---------------------------------------------

const auf = A.runde.aufdeckung;
muss(auf.stand.length === 3, "Nicht alle drei stehen in der Aufdeckung");
console.log("    " + auf.stand.map((s) => `${s.name} ${blatt(s.hand)} = ${s.punkte}`).join(" · "));
console.log("    " + auf.meldung);

for (const s of auf.stand) {
  muss(s.punkte === punkteVon(s.hand),
    `${s.name}: Server sagt ${s.punkte}, karten.js sagt ${punkteVon(s.hand)}`);
}
const sollen = auswertung(auf.stand).verlierer.map((s) => s.name).sort();
const haben = auf.stand.filter((s) => s.verliert).map((s) => s.name).sort();
muss(JSON.stringify(sollen) === JSON.stringify(haben),
  `Verlieren müssten ${sollen.join(",")}, markiert sind ${haben.join(",")}`);
console.log(`ok  der Server rechnet dasselbe wie karten.js: ${haben.join(", ")} verliert ein Leben`);

for (const s of A.runde.spieler) {
  const soll = haben.includes(s.name) ? 2 : 3;
  muss(s.leben === soll, `${s.name} hat ${s.leben} Leben statt ${soll}`);
}
muss(A.runde.spieler.every((s) => !s.schwimmt), "Nach der ersten Runde schwimmt schon jemand");
console.log("ok  genau die Verlierer haben ein Leben weniger");

// Jetzt liegen die Karten offen – vorher lagen sie es nicht, das steht oben.
const alleHaende = auf.stand.flatMap((s) => s.hand.map(karte));
muss(new Set(alleHaende).size === alleHaende.length, "Beim Aufdecken liegt eine Karte doppelt");

// --- Die nächste Runde ------------------------------------------------------

await bis(() => A.runde.n === 2 && A.runde.schritt === "zug", "zweite Runde", 12_000);
muss(A.runde.aufdeckung === null, "Die alte Aufdeckung steht noch in der neuen Runde");
muss(A.runde.geklopft === null, "Das Klopfen der ersten Runde gilt noch");
muss(alleC.every((c) => c.runde.hand.length === 3), "In der zweiten Runde fehlen Karten");
console.log("ok  neue Runde: neue Karten, kein Klopfen, keine alte Aufdeckung");

// --- Abgang mitten im Zug ---------------------------------------------------

const geht = amZug();
const bleiben = alleC.filter((c) => c !== geht);
geht.send({ t: "leave" });
await bis(() => bleiben[0].runde.spieler.length === 2, "einer ist raus");
muss(bleiben[0].runde.amZug !== geht.you, `Der Zug hängt an ${geht.name} – weg, aber noch dran`);
console.log(`ok  ${geht.name} geht mitten im eigenen Zug – die Runde läuft weiter`);

// --- Unter zwei Leuten ist Schluss ------------------------------------------

const letzter = bleiben.find((c) => c.you === bleiben[0].room.hostId) ?? bleiben[0];
const vorletzter = bleiben.find((c) => c !== letzter);
vorletzter.send({ t: "leave" });
await bis(() => letzter.final, "Endstand");

const f = letzter.final;
muss(f.tabelle.length === 1, "Im Endstand steht nicht genau der Übriggebliebene");
muss(f.tabelle[0].name === letzter.name, "Der Falsche bleibt über Wasser");
muss(/bleibt über Wasser/.test(f.untertitel), "Falscher Untertitel: " + f.untertitel);
console.log(`ok  unter zwei Leuten ist Schluss: ${f.untertitel}`);

letzter.send({ t: "again" });
await bis(() => letzter.room.phase === "lobby", "zurück im Warteraum");
console.log("ok  Nochmal setzt alles zurück");

if (alleC.some((c) => c.fehler.length)) {
  throw new Error("Fehlermeldungen: " + JSON.stringify(alleC.map((c) => c.fehler)));
}
console.log("\nALLES GRÜN");
Deno.exit(0);
