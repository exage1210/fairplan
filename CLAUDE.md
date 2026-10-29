# Fairplan – Projektnotiz

Putzplan-PWA für einen Haushalt mit 2 Personen. Version 1 ist fertig und in Benutzung (seit 28.10.2026).

## Zusammenarbeit
- Antworten kurz, direkt, auf Deutsch, per du. Daniel ist Anfänger bis fortgeschritten (österreichisches Deutsch: Gewand, Vorzimmer, Backrohr).
- Nur in diesem Ordner arbeiten. Keine Extras ohne Wunsch, keine globalen Installationen ohne Rückfrage.
- Bei Anleitungen: kleine Etappen, genaue Klickwege, auf Screenshot warten.

## Wo was liegt
- Code: dieser Ordner. Online: https://exage1210.github.io/fairplan/ (GitHub-Repo exage1210/fairplan, Pages aus `main` / root).
- Daten: Firebase-Projekt `fairplanapp` (Spark-Tarif), Firestore `(default)` in europe-west3, anonyme Anmeldung, Regeln aus `firestore.rules`. Autorisierte Domain `exage1210.github.io` ist eingetragen. Werte stehen in `config.js`.
- Aktualisieren: geänderte Dateien auf GitHub über „Add file → Upload files“ hochladen (Daniel macht das per Drag & Drop im Browser, kein Git). Danach App am Handy ganz schließen und neu öffnen.

## Aufbau
- `js/logic.js`: Fälligkeit und Rotation (reine Funktionen), Tests in `tests/logic.test.js` (`node --test`).
- `js/store.js`: Firestore bzw. lokaler Testmodus (wenn `config.js` leer).
- `js/app.js`: Oberfläche (Einrichtung, Heute, Alle, Kalender, Verlauf, Optionen, Editor).
- `js/template.js`: Vorlage „Vorschlag für 2 Personen“. Wirkt nur bei neu angelegten Haushalten, bestehende Haushalte ändern sich dadurch nicht.
- `sw.js`: Offline-Cache; bei Änderung der Dateiliste `SHELL` anpassen.

## Getroffene Entscheidungen
- Pakettausch am Monatsersten, gezählt ab Einrichtungsmonat.
- Verpasste Aufgabe bleibt bei der Person, die sie verpasst hat; erscheint einmal rot als „nicht geschafft“. Ausnahmen: Tägliches verfällt einfach; während einer Abwesenheit (`away` im Haushalt, pro Person von–bis) pausiert es (Gemeinsames nur, wenn beide weg sind).
- Intervall „Bei Bedarf“ (`n: 0, unit: 'need'`): kein Rhythmus, Schlüssel `need:<Tag>`, nie überfällig, keine Kalenderpunkte, zählt aber im Verlauf/Kalender.
- Halbjährlich/jährlich: fester gemeinsamer Tag (Standard 15.4./15.10. bzw. 15.4.); lag der Tag beim Anlegen schon zurück → erst nächste Periode.
- Saison bei Tages-/Wochenintervallen: Periode zählt nur, wenn sie in der Saison beginnt; bei Monatsintervallen rutscht die Fälligkeit auf den ersten Saisontag.
- Zeitfenster (28.10.2026): längere Intervalle sind erst in der 2. Hälfte ihrer Periode dran (alle 2 Wochen → 2. Woche, monatlich → ab 15., vierteljährlich → 3. Monat, eigene → ab Mitte), damit die Abstände auch nach einem Pakettausch gleichmäßig bleiben. Periodenschlüssel unverändert.
- Wochentag pro Aufgabe (wöchentlich/alle 2 Wochen, Felder `wd` Mo=0…So=6, `wk` 0/1 = Rhythmus um eine Woche versetzt): dran ab diesem Tag bis Sonntag der Woche. Ohne `wd` wie bisher.
- Start des Plans = `setup` des Haushalts, in Optionen änderbar; Aufgaben zählen frühestens ab da (auch wenn `created` älter ist).
- Kalender (Etappe 2, 29.10.2026): lädt Erledigungen des sichtbaren Zeitraums (`watchDays`, Abfrage auf `day`). Pro Tag ein Punkt je Person, die etwas erledigt hat; Schalter „Geplantes anzeigen“ (pro Gerät, localStorage `fairplan.plan`) zeigt Ringe ab Fensterbeginn, nur ab heute und ab Start des Plans. Oben Monatsbilanz als Zeile mit Balken in Personenfarben, unten Verlauf des Monats (eigener Tab „Verlauf“ entfällt, `watchHistory` wird nicht mehr genutzt). Tag antippen = Panel von unten: Erledigt (wer, wann, für wen) + vergangen „Offen geblieben“ (Fenster endete an dem Tag, nicht erledigt) bzw. heute/später „Dran“.
- Aktuell (Etappe 1b, 29.10.2026, ersetzt „Heute“, View-Schlüssel bleibt `heute`): nach Frist gruppiert – Noch offen (überfällig) · Heute (endet heute, inkl. Tägliches) · Diese Woche (endet bis So) · Später (eingeklappt: endet nach So oder startet erst, „bis …“/„ab …“). Vorne nur eigene + gemeinsame; andere Personen unten eingeklappt („Sabrina: 3 offen“), abhaken = Vertretung. Vergessenes neutral mit „seit … offen“ in gedämpftem Rot (nur bei eigenen/gemeinsamen). Intervall klein rechts in der Zeile. Kasten oben: „Heute X · Diese Woche Y · Z noch offen“, leer: „Alles erledigt“ + Als Nächstes. Abhaken: durchstreichen, wegrutschen, Rückgängig; nach rechts wischen = abhaken. Fairness-Bilanz pro Monat (Anzahl, ohne Gewichtung) in Verlauf und Kalender.
- Abmachungen (`rules` im Haushalt, Liste von Texten; in Optionen als Textfeld, eine pro Zeile). Seit 29.10.2026 täglich abhakbar: eine graue Checkbox für beide, Gruppe „Abmachungen“ auf Aktuell unter „Heute“, abgehakt bleibt sie stehen mit „erledigt von …“. Nie offen/vergessen. Erledigung als normale Completion (`taskId` = `rule-<Hash des Texts>`, `key` = `rule:<Tag>`, `rule: true`) → zählt in Bilanz, Verlauf, Kalender und später fürs Belohnungssystem (Joker). Text ändern = neue Kennung. Vorgeschlagene Abmachungen = `TEMPLATE_RULES` (Geschirr und Küche (Herd und Flächen), Einkaufen, Kochen, Kurz aufräumen): beim 2-Personen-Vorschlag alle dabei, bei „Leer starten“ eigener Schritt zum Auswählen, in Optionen als Knöpfe zum An-/Abwählen; eigene Abmachungen im Textfeld darunter (Vorschläge stehen vorne). Aufgabe „Einkaufen“ aus der Vorlage entfernt.
- Zahl am App-Icon (Badging API, `setAppBadge`): nicht Geschafftes + jetzt dran (eigenes + gemeinsames), ohne Tägliches; nur aktualisiert, wenn die App läuft. iPhone braucht Mitteilungs-Erlaubnis (Button in Optionen).
- Offen: Push-Benachrichtigungen an die andere Person brauchen einen Server (Firebase Blaze mit Kreditkarte oder z. B. Cloudflare Workers) – noch nicht entschieden.
- Farben: 6 (Rot und Gold entfernt; CSS-Variablen bleiben für alte Daten). Tab „Einstellungen“ heißt „Optionen“, neuer Tab „Kalender“ (ab Montag).
- Runde 2, Etappe 1a (29.10.2026): Logo/Icon „fairplan“ in einer Zeile, weiß, Systemschrift halbfett. Personenfarben Blau #5B8DEF, Rosa #F07FB0, Gelb #F2C94C, Grün #5BC98C, Violett #A78BFA, Orange #F59E5B (Schwarz/Weiß nicht mehr wählbar, Variablen bleiben). Fast-schwarzer Hintergrund #111214, keine Trennlinien, Ecken 3 px, kompakte Zeilen. Checkbox-Rand in Personenfarbe (abgehakt gefüllt), Gemeinsames grau, kein Farbstreifen. Rot nur für Vergessenes. 4 Tabs: Aktuell · Alle · Kalender · Optionen; Verlauf vorübergehend über Optionen. Plan der weiteren Etappen: Vault-Notiz „Projekte/Fairplan/Änderungen 2026-10-29“.
- Nachträglich ergänzt: Bügeln (wöchentlich, A), Einkaufen (wöchentlich, B), Auto putzen und Lüftungsfilter im Bad (halbjährlich, gemeinsam).

## Offen / Ideen
- Daniel möchte die App weiter nach eigenen Wünschen optimieren.
- Später (nicht V1): mehr als 2 Personen, faire Neuaufteilung nach Aufwand.
