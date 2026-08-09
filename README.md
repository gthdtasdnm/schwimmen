# Schwimmen (31) 🃏

Drei Karten auf der Hand, drei offen in der Mitte, drei Leben. Wer am Ende der
Runde am wenigsten hat, verliert eins. Bei null schwimmt man – und beim
nächsten Mal ist man raus.

Läuft auf **Deno**, ohne eine einzige externe Abhängigkeit. Kein Build-Schritt,
kein `node_modules`, ein Prozess.

---

## Starten

```bash
deno task dev          # http://localhost:8063/
PORT=9000 deno task dev
deno task check        # Typprüfung
deno task probe        # spielt eine Runde durch (Server muss laufen)
```

Zum Ausprobieren allein: die Seite in **mehreren Browserfenstern** öffnen. Jedes
Fenster ist ein eigener Spieler.

## An den Tisch kommen

Name eintippen, **Raum eröffnen** oder über die Liste bzw. den vierstelligen
**Code** beitreten. **Zwei bis sechs** Leute.

## Die Punkte

Gezählt wird immer nur **eine** Farbe: die beste.

| Karte | Wert |
|---|---|
| 7, 8, 9, 10 | wie aufgedruckt |
| Bube, Dame, König | 10 |
| Ass | 11 |

Das Höchste sind **31** (Ass + Zehn + König in einer Farbe). Drei gleiche Ränge
zählen **30,5** – zwischen 30 und 31, wie am Kartentisch.

## Ein Zug

Wer dran ist, hat genau drei Möglichkeiten:

- **eine Karte tauschen** gegen eine aus der Mitte,
- **alle drei tauschen** gegen die Mitte,
- **schieben**. Schieben alle reihum, kommen drei neue Karten in die Mitte.

Statt zu ziehen kann man **klopfen**: dann hat jeder andere noch genau einen
Zug, danach wird aufgedeckt.

## Die Auflösung

Wer am wenigsten hat, verliert ein Leben – bei Gleichstand alle, die es trifft.
**31 oder ein Drilling ist Feuer:** dann verlieren alle *anderen* ein Leben.

Die Aufdeckung bleibt sieben Sekunden stehen, dann wird neu gegeben. Wer keine
Leben mehr hat, schwimmt; wer als Schwimmer noch einmal verliert, ist raus.
Unter zwei Leuten ist Schluss.

## Was nur der Server weiß

Gerechnet wird ausschließlich im Server. Der Client bekommt seine **eigene**
Hand mit fertig ausgerechneter Punktzahl und von den anderen nur die Zahl ihrer
Leben – die fremden Karten erst beim Aufdecken. `probe.js` prüft in jedem Zug,
dass in der Spielerliste keine fremde Karte steht.

## karten.js

Blatt, Punkte und Auswertung liegen in einer **eigenen Datei**, nicht im
`server.js`. Der Grund ist die Probe: die Karten sind zufällig, also kann sie
keinen bestimmten Ausgang ansagen. Sie rechnet stattdessen jede Aufdeckung mit
derselben `karten.js` nach, mit der auch der Server rechnet – wen der Server
als Verlierer markiert, muss `auswertung()` genauso sehen. Eine nachgebaute
Kopie in der Probe könnte auseinanderlaufen, ohne dass es jemandem auffällt.

Derselbe Gedanke wie bei `zug.js` im Wortleger.

## Wenn jemand geht

- Wer die Verbindung verliert, behält seinen Platz eine Minute lang.
- Verlässt jemand den Raum, während er am Zug ist, rückt der Zug weiter – die
  Runde bleibt nicht stehen.
- Fallen die Mitspieler unter zwei, endet die Partie.

## Dateien

| Datei | Was |
|---|---|
| `server.js` | Geben, Zugreihenfolge, Klopfen, Aufdecken, Leben |
| `karten.js` | Blatt, Punkte, Auswertung – auch von `probe.js` benutzt |
| `probe.js` | rechnet ohne Server, dann eine Runde mit drei Clients |
| `bremse.js`, `raum.js`, `statisch.js` | gemeinsam, **wortgleich in allen Spielen** |
| `public/index.html` | alle vier Bildschirme plus die Hilfe |
| `public/schale.js` | gemeinsame Client-Schale (Verbindung, Lobby) |
| `public/style.css` | Lobby-Basis, gemeinsamer Rahmen, darunter das Eigene |
| `public/app.js` | Hand, Mitte, Zugknöpfe, Aufdeckung |

## Betrieb

Port **8063**, gebunden auf `127.0.0.1`, davor Apache als Reverse Proxy unter
`/schwimmen/`. Dienst: `schwimmen.service` (systemd, läuft als `www-data`).

```bash
systemctl status schwimmen
journalctl -u schwimmen -f
```

Der Zustand liegt vollständig im RAM. Ein Neustart wirft alle laufenden Partien
weg – das ist gewollt, es gibt nichts zu sichern.
