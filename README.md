# Kalorientracker

Eine Kalorientracker-Web-App (PWA) nach dem Vorbild von Cal AI und MyFitnessPal – **kostenlos, offline-fähig und ohne Konto**. Alle Daten bleiben im Browser auf deinem Gerät.

## Funktionen

- **Foto-Erkennung direkt im Browser** – Google „AIY Vision Classifier Food V1“ (ca. 2000 Gerichte) läuft mit TensorFlow Lite lokal. Keine Kosten pro Foto, keine Uploads. Bei unsicherer Erkennung fragt die App nach („Ist das X oder Y?“).
- **Barcode-Scanner** (Kamera oder Nummer eintippen) mit Produktdaten aus Open Food Facts
- **Suche**: über 40 Grundnahrungsmittel lokal, dazu Open Food Facts auf Knopfdruck
- **Manuell eintragen**, eigene Lebensmittel, **Favoriten**, **Zuletzt gegessen**, **Rezepte**, **Mahlzeit vom Vortag kopieren**
- **Tagebuch** mit Frühstück, Mittag, Abend, Snacks; Tageswechsel per Pfeil, Wischen oder Datumswähler
- **Dashboard**: verbleibende Kalorien als Ring, Makro-Balken, Wassertracker, Streak
- **Fortschritt**: Gewichtsverlauf, Kalorien pro Tag mit Ziellinie, Tage im Ziel, Makroverteilung (7/30/90 Tage)
- **Onboarding** mit Zielberechnung nach Mifflin-St Jeor, Aktivitätsfaktor und Wunschtempo – mit Sicherheitsgrenzen (Mindestkalorien, kein Abnehmziel bei Untergewicht, Warnung bei zu hohem Tempo)
- **Erinnerungen** als Kalender-Termine (.ics) – zuverlässig ohne Server
- **Datenschutz**: CSV-Export, JSON-Backup und -Import, alles löschen
- Hell- und Dunkelmodus, installierbar auf dem Startbildschirm

## Nutzen

### Variante 1: GitHub Pages (empfohlen)

1. Repository auf GitHub hochladen (oder forken).
2. Unter **Settings → Pages** bei „Source“ **GitHub Actions** wählen.
3. Der Workflow `.github/workflows/pages.yml` läuft bei jedem Push auf `main`: Er testet die App, lädt Modell und Bibliotheken herunter und veröffentlicht alles.
4. Die App ist dann unter `https://<dein-name>.github.io/<repo-name>/` erreichbar. Am Handy öffnen und „Zum Startbildschirm hinzufügen“.

### Variante 2: Lokal

```bash
git clone <repo-url>
cd kalorientracker
bash scripts/fetch-assets.sh   # Modell + Bibliotheken (optional, sonst lädt die App sie online)
npm start                      # oder: python3 -m http.server 8080
```

Dann `http://localhost:8080` öffnen. Für die Kamera am Handy braucht es HTTPS – dafür ist GitHub Pages der einfachste Weg.

## Tests

```bash
npm test
```

Testet Zielberechnung, Nährwerte, Auswertungen, Export, Open-Food-Facts-Umwandlung und die Auswertung der Bilderkennung (ohne Browser, nur Node.js ≥ 20).

## Aufbau

```
index.html, manifest.webmanifest, sw.js   App-Hülle, Installation, Offline-Cache
css/app.css                               Design (mobil, hell/dunkel)
js/main.js                                Router, App-Zustand, Tab-Leiste
js/db.js                                  Lokale Datenbank (IndexedDB)
js/draft.js                               Entwurf der aktuell erfassten Mahlzeit
js/ui.js                                  UI-Bausteine ohne Framework
js/off.js                                 Open Food Facts
js/lib/                                   Reine Logik: Berechnung, Datum, Nährwerte, Statistik, Export, Diagramme
js/data/                                  Nährwerte zu den Foto-Klassen, Grundnahrungsmittel
js/recognition/                           Foto-Erkennung (TFLite im Browser) und Auswertung
js/views/                                 Die einzelnen Bildschirme
scripts/fetch-assets.sh                   Lädt Modell, Labelliste und Bibliotheken
tests/                                    Node-Tests
```

Kein Build-Schritt nötig: reines HTML, CSS und JavaScript (ES-Module).

## Erweitern

- **Weitere Gerichte für die Foto-Erkennung**: in `js/data/food-classes.js` eintragen. Der Schlüssel muss exakt dem Label des Modells entsprechen (Liste: `models/aiy_food_V1_labels.json` nach dem Download).
- **Bessere Erkennung später**: Alle Erkennungsvarianten liefern dasselbe Ergebnisformat (siehe `js/recognition/postprocess.js`). Ein eigener Server mit einem Vision-Modell kann also später eingebaut werden, ohne die übrige App zu ändern.

## Grenzen

- Das Foto-Modell erkennt **Gerichte**, keine Einzelzutaten wie Obst – dafür gibt es Suche und Barcode. Es liefert ein Ergebnis pro Foto und schätzt keine Menge; die Portion wählst du.
- Die mitgelieferten Nährwerte sind **Richtwerte** für typische Zubereitungen.
- Web-Apps können ohne Server keine Push-Erinnerungen senden – daher die Kalender-Termine.
- Browser dürfen lokale Daten bei Speichermangel löschen. Die App bittet um dauerhaften Speicher; trotzdem ab und zu ein Backup machen. Auf dem iPhone die App auf den Home-Bildschirm legen.

## Hinweis

Alle Kalorien- und Nährwertangaben sind Schätzungen. Die App ersetzt keine medizinische oder ernährungstherapeutische Beratung und ist für Erwachsene gedacht.

## Quellen & Lizenzen

- Code: MIT (siehe `LICENSE`)
- Produktdaten: © [Open Food Facts](https://world.openfoodfacts.org), Open Database License (ODbL)
- Foto-Modell: Google AIY Vision Classifier Food V1 (TensorFlow Hub / Kaggle) – Lizenz bitte auf der Modellseite prüfen
- TensorFlow.js (Apache 2.0), ZXing (Apache 2.0)
