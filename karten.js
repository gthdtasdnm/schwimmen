// Das Blatt und die Punkte – als eigene Datei, damit `probe.js` genau die
// Funktion prüfen kann, mit der auch der Server rechnet. Sonst prüft die Probe
// eine Nachbildung, und die kann mit dem Server auseinanderlaufen, ohne dass
// es jemandem auffällt. Dasselbe Muster wie `zug.js` beim Wortleger.
//
// 32 Blatt, Skatkarten. Gezählt wird nur eine Farbe: die beste.

export const RAENGE = ["7", "8", "9", "10", "B", "D", "K", "A"];
export const FARBEN = ["♠", "♥", "♦", "♣"];
export const WERT = { "7": 7, "8": 8, "9": 9, "10": 10, "B": 10, "D": 10, "K": 10, "A": 11 };

/** Höchstmögliche Punktzahl aus einer Farbe: ♥A + ♥10 + ♥K = 31. */
export const HOECHSTE = 31;

/** Drei gleiche Ränge zählen 30,5 – zwischen 30 und 31, wie am Kartentisch. */
export const DRILLING = 30.5;

export function mische(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export const neuesDeck = () => mische(FARBEN.flatMap((f) => RAENGE.map((r) => ({ r, f }))));

/** Punkte einer Hand: höchste Farbsumme, oder 30,5 für einen Drilling. */
export function punkteVon(hand) {
  if (hand.length === 3 && hand.every((k) => k.r === hand[0].r)) return DRILLING;
  let best = 0;
  for (const f of FARBEN) {
    const s = hand.filter((k) => k.f === f).reduce((n, k) => n + WERT[k.r], 0);
    if (s > best) best = s;
  }
  return best;
}

/** „Feuer“: 31 oder ein Drilling. Dann verlieren alle anderen ein Leben. */
export const hatFeuer = (punkte) => punkte === HOECHSTE || punkte === DRILLING;

/**
 * Wer verliert diese Runde ein Leben?
 *
 * Ohne Feuer die niedrigste Punktzahl – bei Gleichstand alle, die sie haben.
 * Mit Feuer genau umgekehrt: alle, die keins haben.
 *
 * @param {{punkte:number}[]} stand
 * @returns {{verlierer:object[], feuer:object[]}}
 */
export function auswertung(stand) {
  const feuer = stand.filter((s) => hatFeuer(s.punkte));
  if (feuer.length) return { feuer, verlierer: stand.filter((s) => !feuer.includes(s)) };
  const min = Math.min(...stand.map((s) => s.punkte));
  return { feuer, verlierer: stand.filter((s) => s.punkte === min) };
}
