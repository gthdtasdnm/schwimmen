// SCHWIMMEN – Client. Tauschen heißt: eine eigene Karte antippen und dann
// eine aus der Mitte.
import { $, el, S, schicke, starteSchale, zeige } from "./schale.js";

const HILFE = [
  "<b>Drei Karten auf der Hand, drei offen in der Mitte.</b> Ziel sind 31 Punkte in einer Farbe.",
  "<b>Werte:</b> 7 bis 10 wie aufgedruckt, Bube/Dame/König zehn, Ass elf. Drei gleiche Zahlen zählen 30,5.",
  "<b>Du bist dran:</b> eine Karte tauschen, alle drei tauschen, oder schieben.",
  "<b>Schieben alle reihum</b>, kommen drei neue Karten in die Mitte.",
  "<b>Klopfen</b> heißt: alle anderen haben noch genau einen Zug, dann wird aufgedeckt.",
  "<b>Wer am wenigsten hat, verliert ein Leben.</b> Drei Leben, danach schwimmst du – beim nächsten Mal bist du raus.",
  "<b>31 oder ein Drilling ist Feuer:</b> alle anderen verlieren sofort ein Leben.",
];

let gewaehlteHand = null;
const rot = (k) => k.f === "♥" || k.f === "♦";
const kartenKnopf = (k, cls) => el("button", "karte " + cls + (rot(k) ? " rot" : ""), `${k.r}${k.f}`);

function zeichneSpiel(m) {
  zeige("game");
  $("tbLinks").innerHTML = `Runde <strong>${m.n}</strong>`;
  $("tbTag").textContent = m.geklopft ? `${m.geklopft} klopft` : "Schwimmen";

  const b = $("buehne");
  b.innerHTML = "";

  const tisch = el("div", "tisch");
  for (const p of m.spieler) {
    const d = el("div", "sp" + (p.id === m.amZug ? " zug" : "") + (p.weg ? " off" : ""));
    d.append(el("span", "sp-nm", p.name + (p.klopft ? " ✊" : "")));
    d.append(el("span", "sp-lb", p.schwimmt ? "🏊 schwimmt" : "♥".repeat(p.leben)));
    tisch.append(d);
  }
  b.append(tisch);

  if (m.aufdeckung) {
    const box = el("div", "aufdeck");
    box.append(el("p", "auf-kopf", m.aufdeckung.meldung));
    for (const s of m.aufdeckung.stand) {
      const z = el("div", "szeile" + (s.verliert ? " verliert" : ""));
      z.append(el("span", "sz-nm", s.name));
      const kk = el("span", "sz-k");
      for (const k of s.hand) kk.append(el("span", "karte mini" + (rot(k) ? " rot" : ""), `${k.r}${k.f}`));
      z.append(kk);
      z.append(el("span", "sz-p", String(s.punkte).replace(".", ",")));
      box.append(z);
    }
    if (m.aufdeckung.raus.length) {
      box.append(el("p", "auf-txt", m.aufdeckung.raus.join(", ") + " ist raus."));
    }
    b.append(box);
  }

  const binDran = m.amZug === S.me && m.schritt === "zug";

  b.append(el("p", "abschnitt", "Mitte"));
  const mitte = el("div", "kartenreihe");
  m.mitte.forEach((k, i) => {
    const c = kartenKnopf(k, "gross");
    c.disabled = !binDran || gewaehlteHand === null;
    c.onclick = () => {
      schicke({ t: "tausch1", hand: gewaehlteHand, mitte: i });
      gewaehlteHand = null;
    };
    mitte.append(c);
  });
  b.append(mitte);

  b.append(el("p", "abschnitt", `Deine Karten · ${String(m.meine).replace(".", ",")} Punkte`));
  const hand = el("div", "kartenreihe");
  m.hand.forEach((k, i) => {
    const c = kartenKnopf(k, "gross" + (gewaehlteHand === i ? " sel" : ""));
    c.disabled = !binDran;
    c.onclick = () => { gewaehlteHand = gewaehlteHand === i ? null : i; zeichneSpiel(m); };
    hand.append(c);
  });
  b.append(hand);
  if (m.meldung && !m.aufdeckung) b.append(el("p", "meldung", m.meldung));

  const akt = $("aktionen");
  akt.innerHTML = "";
  if (binDran) {
    const drei = el("button", "btn", "Alle drei tauschen");
    drei.onclick = () => { gewaehlteHand = null; schicke({ t: "tausch3" }); };
    const schieb = el("button", "btn", "Schieben");
    schieb.onclick = () => { gewaehlteHand = null; schicke({ t: "schieben" }); };
    akt.append(drei, schieb);
    if (!m.geklopft) {
      const kl = el("button", "btn primary", "Ich klopfe");
      kl.onclick = () => { gewaehlteHand = null; schicke({ t: "klopfen" }); };
      akt.append(kl);
    }
    $("rundenHint").textContent = gewaehlteHand === null
      ? "Eigene Karte antippen, dann eine aus der Mitte – oder unten wählen."
      : "Jetzt eine Karte aus der Mitte antippen.";
  } else {
    $("rundenHint").textContent = m.schritt === "aufdecken"
      ? "Aufgedeckt – gleich kommt die nächste Runde."
      : `${m.amZugName} ist dran.`;
  }
}

$("helpList").innerHTML = HILFE.map((h) => `<li>${h}</li>`).join("");
starteSchale({ key: "schwimmen", zeichneSpiel });
