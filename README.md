# Fairplan

Ein einfacher Putzplan für einen Haushalt mit 2 Personen – als App für iPhone und Android, kostenlos, ohne eigenen Server.

- Jede Person hakt ihre Aufgaben ab, erledigte Aufgaben kommen in der nächsten Periode wieder.
- Paket A und B tauschen regelmäßig zwischen den Personen.
- Funktioniert offline; Daten werden über Firebase (kostenloser Spark-Tarif) zwischen den Geräten abgeglichen.

---

## Was du brauchst

- Ein Google-Konto (für Firebase)
- Ein GitHub-Konto (für das kostenlose Hosting)
- Diesen Ordner `fairplan`

Kosten: keine. Du brauchst **keine** Kreditkarte und **nicht** den Blaze-Tarif.

---

## Schritt 1: Firebase einrichten

### 1.1 Projekt anlegen

1. Öffne <https://console.firebase.google.com> und melde dich mit deinem Google-Konto an.
2. Klicke auf **Projekt hinzufügen** (bzw. „Neues Firebase-Projekt erstellen“).
3. Name: z. B. `fairplan`. Weiter.
4. Google Analytics kannst du **deaktivieren**. Projekt erstellen.

### 1.2 Firestore-Datenbank aktivieren

1. Links im Menü: **Build → Firestore Database** → **Datenbank erstellen**.
2. Standort: z. B. `eur3 (europe-west)` oder `europe-west3 (Frankfurt)`. Der Standort lässt sich später nicht ändern.
3. Modus: **Im Produktionsmodus starten**. Erstellen.

### 1.3 Anonyme Anmeldung aktivieren

1. Links: **Build → Authentication** → **Jetzt starten**.
2. Reiter **Sign-in method** → **Anonym** → einschalten → Speichern.

### 1.4 Regeln einspielen

1. **Firestore Database** → Reiter **Regeln**.
2. Den gesamten Inhalt löschen.
3. Den Inhalt der Datei `firestore.rules` aus diesem Ordner hineinkopieren.
4. **Veröffentlichen**.

Die Regeln sorgen dafür, dass nur Geräte mit dem richtigen Haushalts-Code an die Daten kommen und niemand die Haushalte auflisten kann.

### 1.5 `config.js` befüllen

1. Firebase-Konsole → Zahnrad oben links → **Projekteinstellungen** → Reiter **Allgemein**.
2. Unten bei „Meine Apps“ auf das Web-Symbol **`</>`** klicken.
3. App-Name: `fairplan`. „Firebase Hosting“ **nicht** anhaken. **App registrieren**.
4. Es erscheint ein Code-Block mit `const firebaseConfig = { apiKey: "...", ... }`.
5. Öffne `config.js` in diesem Ordner mit einem Texteditor und trage die Werte ein, z. B.:

   ```js
   export const firebaseConfig = {
     apiKey: 'AIza...',
     authDomain: 'fairplan-1234.firebaseapp.com',
     projectId: 'fairplan-1234',
     storageBucket: 'fairplan-1234.appspot.com',
     messagingSenderId: '1234567890',
     appId: '1:1234567890:web:abc123',
   };
   ```

6. Speichern.

Hinweis: Diese Werte sind nicht geheim – sie stehen in jeder Web-App öffentlich. Geschützt werden die Daten durch die Regeln aus 1.4.

Solange `apiKey` leer ist, läuft die App im **lokalen Testmodus**: Alles funktioniert, aber die Daten liegen nur im Browser dieses einen Geräts.

### 1.6 Domain freigeben (nach Schritt 2)

Wenn du in Schritt 2 deine GitHub-Pages-Adresse kennst (z. B. `deinname.github.io`):
Firebase → **Authentication** → Reiter **Einstellungen** → **Autorisierte Domains** → **Domain hinzufügen** → `deinname.github.io` eintragen.

---

## Schritt 2: Auf GitHub Pages veröffentlichen

### 2.1 Repository anlegen

1. Öffne <https://github.com/new>.
2. Name: `fairplan`. Sichtbarkeit: **Public** (GitHub Pages ist bei kostenlosen Konten nur für öffentliche Repos gratis).
3. **Create repository**.

> Öffentlich heißt: Der Programmcode ist sichtbar. Eure Haushaltsdaten liegen **nicht** im Repo, sondern in Firebase und sind über den Code geschützt.

### 2.2 Dateien hochladen

Ohne Git-Kenntnisse:

1. Im neuen Repo auf **uploading an existing file** klicken.
2. Den **Inhalt** des Ordners `fairplan` (nicht den Ordner selbst) ins Browserfenster ziehen: `index.html`, `styles.css`, `manifest.json`, `sw.js`, `config.js`, `firestore.rules`, `README.md`, `package.json` und die Ordner `js`, `icons`, `tests`.
3. Unten **Commit changes**.

Mit Git im Terminal (im Ordner `fairplan`):

```bash
git init && git add . && git commit -m "Fairplan v1" && git branch -M main
```

```bash
git remote add origin https://github.com/DEINNAME/fairplan.git && git push -u origin main
```

### 2.3 GitHub Pages einschalten

1. Im Repo: **Settings** → links **Pages**.
2. Bei „Source“: **Deploy from a branch**.
3. Branch: **main**, Ordner: **/ (root)** → **Save**.
4. Nach 1–2 Minuten erscheint oben die Adresse, z. B. `https://deinname.github.io/fairplan/`.

Jetzt Schritt 1.6 erledigen (Domain bei Firebase freigeben).

### Später etwas ändern

Datei im Repo bearbeiten oder neu hochladen – GitHub Pages aktualisiert sich nach 1–2 Minuten. Die App holt sich neue Dateien beim nächsten Öffnen mit Internet. Falls etwas hängt: App einmal ganz schließen und neu öffnen.

---

## Schritt 3: App auf den Homescreen

### iPhone (Safari)

1. Die Adresse (z. B. `https://deinname.github.io/fairplan/`) in **Safari** öffnen (nicht in Chrome).
2. Unten auf **Teilen** tippen (Quadrat mit Pfeil nach oben).
3. **Zum Home-Bildschirm** → **Hinzufügen**.
4. Fairplan ab jetzt über das „F“ am Homescreen öffnen.

### Android (Chrome)

1. Die Adresse in **Chrome** öffnen.
2. Oben rechts auf **⋮** tippen.
3. **App installieren** bzw. **Zum Startbildschirm hinzufügen**.

---

## Schritt 4: Einrichten und zweite Person beitreten lassen

### Person 1 (legt den Haushalt an)

1. Fairplan öffnen → **Haushalt neu anlegen**.
2. Beide Namen eingeben und je eine Farbe wählen.
3. Vorlage wählen: **Vorschlag für 2 Personen** oder **Leer starten**.
4. Der **Haushalts-Code** wird angezeigt → **Code kopieren** und der zweiten Person schicken (z. B. per Messenger).
5. **Weiter** → „Wer bist du?“ → eigenen Namen wählen.

### Person 2 (tritt bei)

1. Fairplan auf dem eigenen Handy installieren (Schritt 3).
2. Im Feld **Haushalts-Code** den Code einfügen → **Beitreten**.
3. „Wer bist du?“ → eigenen Namen wählen.

Den Code findest du jederzeit unter **Einstellungen → Haushalt**. Behandle ihn wie einen Schlüssel: Wer ihn kennt, kann eure Liste sehen und ändern.

Beim allerersten Öffnen muss das Handy online sein. Danach funktioniert die App auch offline; Änderungen werden übertragen, sobald wieder Internet da ist.

---

## So funktioniert's

### Ansichten

- **Heute**: deine fälligen und überfälligen Aufgaben, darunter Gemeinsames. Oben ein Hinweis, wie viel offen ist; unten, wann die Pakete das nächste Mal tauschen.
- **Alle**: alle Aufgaben nach Intervall, Filter nach Person oder Gemeinsam. Hier kannst du auch Aufgaben der anderen Person abhaken (Vertretung) und Erledigtes wieder öffnen.
- **Verlauf**: wer hat was wann erledigt, inkl. „erledigt von … für …“.
- **Einstellungen**: wer bist du (dieses Gerät), Hell/Dunkel, Haushalts-Code, Namen, Farben, Aufgaben, Rotation, gemeinsamer Tag.

### Fälligkeit

Aufgaben richten sich nach festen Kalenderperioden, nicht danach, wann sie zuletzt erledigt wurden:

| Intervall | Periode |
|---|---|
| täglich | jeder Tag |
| wöchentlich | Kalenderwoche Mo–So |
| alle 2 Wochen | jede zweite Kalenderwoche, gezählt ab der Einrichtungswoche |
| monatlich | Kalendermonat |
| vierteljährlich | Quartal |
| halbjährlich | Frühjahr (März–Mai) und Herbst (Sept.–Nov.) |
| jährlich | Kalenderjahr |
| eigenes („alle X Tage/Wochen/Monate“) | feste Blöcke ab dem Einrichtungstag (bei Monaten ab dem Einrichtungsmonat) |

- Erledigt → verschwindet, kommt in der nächsten Periode wieder.
- Nicht erledigt → erscheint **einmal** als „überfällig“, bis es erledigt ist. Mehrere verpasste Durchgänge stapeln sich nicht.
- Saison (Monate von–bis): Die Aufgabe ist nur in diesen Monaten sichtbar und fällig.
- Halbjährliche und jährliche Aufgaben sind am **gemeinsamen Tag** fällig (Standard: 15. April / 15. Oktober bzw. 15. April). Liegt der Tag außerhalb der Saison einer Aufgabe, gilt der erste Saisontag.

### Zuteilung und Rotation

- **Paket A / Paket B**: tauschen zwischen den Personen. Rhythmus pro Intervallgruppe (Standard: bis monatlich alle 2 Monate, vierteljährlich alle 6 Monate). Getauscht wird jeweils am Monatsersten, gezählt ab dem Einrichtungsmonat.
- **Gemeinsam**: jede/r darf abhaken.
- **Pro Person**: jede/r hat die Aufgabe einzeln.
- **Abwechselnd**: jede Periode (bei täglichen Aufgaben: jeden Tag) die andere Person.
- **Zuteilung umdrehen** (Einstellungen → Rotation) tauscht alles sofort.

---

## Für Neugierige

### Ordnerinhalt

| Datei | Zweck |
|---|---|
| `index.html`, `styles.css` | Oberfläche |
| `js/app.js` | Ansichten, Einrichtung, Bedienung |
| `js/logic.js` | Fälligkeit und Rotation (ohne Abhängigkeiten, getestet) |
| `js/store.js` | Datenspeicher (Firestore bzw. lokaler Testmodus) |
| `js/template.js` | Vorlage „Vorschlag für 2 Personen“ |
| `config.js` | deine Firebase-Konfiguration |
| `firestore.rules` | Sicherheitsregeln für Firestore |
| `manifest.json`, `sw.js`, `icons/` | Installierbarkeit und Offline-Betrieb |
| `tests/logic.test.js` | Unit-Tests |

### Tests ausführen

Benötigt Node.js 18 oder neuer:

```bash
node --test
```

### Lokal ausprobieren

Im Ordner `fairplan`:

```bash
python3 -m http.server 8000
```

Dann <http://localhost:8000> im Browser öffnen. Ohne befüllte `config.js` läuft die App im lokalen Testmodus.

### Datenmodell (Firestore)

```
households/{code}                 Personen, Einrichtungstag, Rotation, gemeinsamer Tag
households/{code}/tasks/{id}      Aufgaben
households/{code}/completions/{id} Erledigungen (wer, wann, für wen, welche Periode)
```

Der Haushalts-Code besteht aus 16 zufälligen Zeichen (ca. 80 Bit) und ist praktisch nicht zu erraten.

### Kostenlos-Grenzen

Der Spark-Tarif erlaubt 50.000 Lesezugriffe und 20.000 Schreibzugriffe pro Tag. Fairplan lädt nur die Erledigungen der aktuellen und vorherigen Periode und den Verlauf nur, wenn du ihn öffnest – für zwei Personen bleibt ihr weit darunter.
