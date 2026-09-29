# Lauf-Held 🏃

Ein Spiel für draußen: **Deine echte Bewegung steuert das Spiel.**

- **Oben: Google Maps.** Die Karte zeigt, wo du gerade läufst, und zeichnet deine Strecke blau nach.
  Um dich herum liegen Münzen ★. Lauf in echt hin (bis auf ca. 20 m), dann sammelst du sie ein: +10 Punkte.
- **Unten: Jump & Run.** Die Figur läuft **genau so schnell wie du** (gemessen per GPS).
  Stehst du still, bleibt auch die Figur stehen.
- **Springen:** Wenn du in echt hüpfst, springt die Figur im Spiel. **Je höher du springst, desto höher springt sie.**
  Der Bewegungssensor misst, wie lange du in der Luft bist.

## Punkte

| Was                         | Wie bekommt man es?                  | Punkte |
|-----------------------------|--------------------------------------|--------|
| Bodenmünze                  | einfach drüberlaufen                 | 1      |
| Luftmünze                   | normal springen                      | 2      |
| Diamant 💎                  | richtig hoch springen                | 5      |
| Karten-Münze ★              | auf der Karte hinlaufen              | 10     |
| Kiste (nicht übersprungen)  | man stolpert                         | −3     |

Deine Geschwindigkeit ist der Multiplikator, den Unterschied merkst du sofort:

| Tempo      | Geschwindigkeit | Punkte | Himmel     |
|------------|-----------------|--------|------------|
| Gehen      | bis ca. 8 km/h  | ×1     | blau       |
| Joggen     | 8–14 km/h       | ×2     | orange     |
| Sprinten   | über 14 km/h    | ×3     | rot, mit Speed-Linien |

Tippen aufs Spiel löst einen Testsprung aus (praktisch zum Ausprobieren in der Wohnung).

⚠️ **Achte beim Laufen immer auf den Verkehr und schau nicht die ganze Zeit aufs Handy!**

## Google-Maps-Schlüssel einrichten (einmalig)

Ohne Schlüssel funktioniert das Spiel trotzdem, nur die Karte bleibt aus.

1. Auf <https://console.cloud.google.com/> ein Projekt anlegen.
   Google verlangt dafür ein Rechnungskonto, für ein privates Spiel reicht aber das kostenlose Kontingent.
2. Unter **APIs & Dienste → Bibliothek** das **„Maps SDK for Android“** aktivieren.
3. Unter **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → API-Schlüssel** einen Schlüssel erzeugen.
4. Den Schlüssel einschränken (empfohlen): **Android-Apps** auswählen und eintragen:
   - Paketname: `de.laufheld.app`
   - SHA-1-Fingerabdruck: `26:9C:C9:A9:C0:B4:4D:D2:76:F9:C5:B5:FC:C6:4A:A8:6A:2E:A8:1D`
5. Den Schlüssel eintragen:
   - **Für den automatischen Bau auf GitHub:** Im Repository unter
     **Settings → Secrets and variables → Actions → New repository secret**
     ein Secret mit dem Namen `MAPS_API_KEY` anlegen und den Schlüssel einfügen.
   - **Für Android Studio:** In `lauf-held-app/local.properties` die Zeile `MAPS_API_KEY=dein-schlüssel` ergänzen.

## APK herunterladen

1. Im Repository auf **Actions** gehen und den Workflow **„Lauf-Held APK bauen“** öffnen.
2. Den neuesten erfolgreichen Durchlauf (grüner Haken) anklicken.
3. Unten bei **Artifacts** die Datei `lauf-held-apk` herunterladen (eine ZIP-Datei).
4. ZIP entpacken und `app-debug.apk` auf dem Handy öffnen.
   Android fragt einmal, ob Installationen aus dieser Quelle erlaubt sind.

Nachdem du den Maps-Schlüssel als Secret eingetragen hast: Unter **Actions** den Workflow mit **„Run workflow“** neu starten, damit die Karte in der APK enthalten ist.

## Selbst bauen (optional)

Mit [Android Studio](https://developer.android.com/studio) den Ordner `lauf-held-app` öffnen und auf ▶️ drücken, oder:

```bash
cd lauf-held-app
./gradlew assembleDebug
```

## Technik

| Datei                  | Aufgabe                                                              |
|------------------------|----------------------------------------------------------------------|
| `MainActivity.kt`      | Erlaubnisse, Karte einbinden, alles verbinden                        |
| `LocationTracker.kt`   | GPS: Position, Geschwindigkeit, gelaufene Strecke                    |
| `JumpDetector.kt`      | Bewegungssensor: erkennt echte Sprünge und misst die Flugzeit        |
| `MapGame.kt`           | Google Maps: Strecke zeichnen, Münzen verteilen und einsammeln       |
| `RunnerView.kt`        | Das Jump & Run (Figur, Münzen, Kisten, Punkte)                       |

`app/debug.keystore` ist ein Test-Signaturschlüssel. Er sorgt dafür, dass jede gebaute APK denselben
SHA-1-Fingerabdruck hat (passend zum Maps-Schlüssel) und sich Updates einfach drüberinstallieren lassen.
Für eine Veröffentlichung im Play Store bräuchte man einen eigenen, geheimen Schlüssel.
