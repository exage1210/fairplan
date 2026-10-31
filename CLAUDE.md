# Fairplan – Projektnotiz

Putzplan-PWA für einen Haushalt mit 2 Personen. Version 1 ist fertig und in Benutzung (seit 28.10.2026).

## Zusammenarbeit
- Bei jedem Start zuerst kurz: aktueller Stand und nächste Schritte (aus der Vault-Notiz `Projekte/Fairplan/Übersicht.md`, online laufende Version prüfen).
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
- `js/template.js`: Vorlage (`TEMPLATE` mit Bereich, Rhythmus, Dauer, Saison, Hinweis; `when` = nur wenn es das im Haushalt gibt), Kern (`CORE_*`), unser Plan (`OUR_*`) und Abmachungen. Wirkt nur beim Einrichten, bestehende Haushalte ändern sich dadurch nicht.
- `sw.js`: Offline-Cache; bei Änderung der Dateiliste `SHELL` anpassen.

## Getroffene Entscheidungen
- Kein Pakettausch mehr (29.10.2026, auf der Merkliste): Paket A gehört fix Person 1, Paket B Person 2 (`packageOwners(ctx)`), in der Oberfläche mit Namen.
- Verpasste Aufgabe bleibt bei der Person, die sie verpasst hat; erscheint einmal rot als „nicht geschafft“. Ausnahmen: Tägliches verfällt einfach; während einer Abwesenheit (`away` im Haushalt, pro Person von–bis) pausiert es (Gemeinsames nur, wenn beide weg sind).
- Intervall „Bei Bedarf“ (`n: 0, unit: 'need'`): kein Rhythmus, Schlüssel `need:<Tag>`, nie überfällig, keine Kalenderpunkte, zählt aber im Verlauf/Kalender.
- Saison bei Tages-/Wochenintervallen: Periode zählt nur, wenn sie in der Saison beginnt; bei Monatsintervallen rutscht die Fälligkeit auf den ersten Saisontag.
- Start des Plans = `setup` des Haushalts, in Optionen änderbar; Aufgaben zählen frühestens ab da (auch wenn `created` älter ist).
- Kalender (Etappe 2, 29.10.2026): lädt Erledigungen des sichtbaren Zeitraums (`watchDays`, Abfrage auf `day`). Pro Tag ein Punkt je Person, die etwas erledigt hat; Schalter „Geplantes anzeigen“ (pro Gerät, localStorage `fairplan.plan`) zeigt Ringe ab Fensterbeginn, nur ab heute und ab Start des Plans. Oben Monatsbilanz als Zeile mit Balken in Personenfarben, unten Verlauf des Monats (eigener Tab „Verlauf“ entfällt, `watchHistory` wird nicht mehr genutzt). Tag antippen = Panel von unten: Erledigt (wer, wann, für wen) + vergangen „Offen geblieben“ (Fenster endete an dem Tag, nicht erledigt) bzw. heute/später „Dran“.
- Aktuell (Etappe 1b, 29.10.2026, ersetzt „Heute“, View-Schlüssel bleibt `heute`): nach Frist gruppiert – Noch offen (überfällig) · Heute (endet heute, inkl. Tägliches) · Diese Woche (endet bis So) · Später (eingeklappt: endet nach So oder startet erst, „bis …“/„ab …“). Vorne nur eigene + gemeinsame; andere Personen unten eingeklappt („Sabrina: 3 offen“), abhaken = Vertretung. Vergessenes neutral mit „seit … offen“ in gedämpftem Rot (nur bei eigenen/gemeinsamen). Intervall klein rechts in der Zeile. Kasten oben: „Heute X · Diese Woche Y · Z noch offen“, leer: „Alles erledigt“ + Als Nächstes. Abhaken: durchstreichen, wegrutschen, Rückgängig; nach rechts wischen = abhaken. Fairness-Bilanz pro Monat (Anzahl, ohne Gewichtung) in Verlauf und Kalender.
- Abmachungen (`rules` im Haushalt, Liste von Texten; in Optionen als Textfeld, eine pro Zeile). Seit 29.10.2026 täglich abhakbar: eine graue Checkbox für beide, Gruppe „Abmachungen“ auf Aktuell unter „Heute“, abgehakt bleibt sie stehen mit „erledigt von …“. Nie offen/vergessen. Erledigung als normale Completion (`taskId` = `rule-<Hash des Texts>`, `key` = `rule:<Tag>`, `rule: true`) → zählt in Bilanz, Verlauf, Kalender und später fürs Belohnungssystem (Joker). Text ändern = neue Kennung. Vorgeschlagene Abmachungen = `TEMPLATE_RULES` (Geschirr und Küche (Herd und Flächen), Einkaufen, Kochen, Kurz aufräumen): beim 2-Personen-Vorschlag alle dabei, bei „Leer starten“ eigener Schritt zum Auswählen, in Optionen als Knöpfe zum An-/Abwählen; eigene Abmachungen im Textfeld darunter (Vorschläge stehen vorne). Aufgabe „Einkaufen“ aus der Vorlage entfernt.
- Zahl am App-Icon (Badging API, `setAppBadge`): nicht Geschafftes + jetzt dran (eigenes + gemeinsames), ohne Tägliches; nur aktualisiert, wenn die App läuft. iPhone braucht Mitteilungs-Erlaubnis (Button in Optionen).
- Offen: Push-Benachrichtigungen an die andere Person brauchen einen Server (Firebase Blaze mit Kreditkarte oder z. B. Cloudflare Workers) – noch nicht entschieden.
- Farben: 6 (Rot und Gold entfernt; CSS-Variablen bleiben für alte Daten). Tab „Einstellungen“ heißt „Optionen“, neuer Tab „Kalender“ (ab Montag).
- Runde 2, Etappe 1a (29.10.2026): Logo/Icon „fairplan“ in einer Zeile, weiß, Systemschrift halbfett. Personenfarben Blau #5B8DEF, Rosa #F07FB0, Gelb #F2C94C, Grün #5BC98C, Violett #A78BFA, Orange #F59E5B (Schwarz/Weiß nicht mehr wählbar, Variablen bleiben). Fast-schwarzer Hintergrund #111214, keine Trennlinien, Ecken 3 px, kompakte Zeilen. Checkbox-Rand in Personenfarbe (abgehakt gefüllt), Gemeinsames grau, kein Farbstreifen. Rot nur für Vergessenes. 4 Tabs: Aktuell · Alle · Kalender · Optionen; Verlauf vorübergehend über Optionen. Plan der weiteren Etappen: Vault-Notiz „Projekte/Fairplan/Änderungen 2026-10-29“.
- Termine (29.10.2026, ersetzt Zeitfenster/Wochentag/gemeinsamen Tag): Perioden bleiben Kalenderwochen/-monate (Quartal, Halbjahr Jän–Jun/Jul–Dez, Jahr; 2 Wochen ab Startwoche). Termin = Putztag der zuständigen Person (`persons[].days`, Mo=0…So=6, Standard Sa; Gemeinsames `sharedDays`; optional `task.day` fest). `task.pos`: wöchentlich der wievielte Putztag der Woche, sonst die Woche in der Periode (erster Putztag dieser Woche). Spielraum (`slackOf`): wöchentlich 2, 2 Wochen 3, monatlich 5, länger 14 Tage; danach „vergessen“. Termine vor dem Start zählen nicht. Vorlage verteilt `pos` je Intervall+Zuteilung (`spreadPositions`).
- Aktuell: Abmachungen oben · Noch offen · Heute (jetzt dran) · Diese Woche (Termin bis So, „Sa, bis Mo“) · Später (Rest der Periode + nächste Termine der kommenden 2 Wochen, „ab Mi 4.11.“). Feiertage AT (`holidays`) im Kalender umrandet, Name im Tages-Panel.
- Einrichtung: Personen (Name, Farbe – Standard Violett/Grün –, „Wann ist der Putztag?“) + gemeinsamer Putztag → Vorlage (große Knöpfe „Vorschlag 2-Personen-Haushalt“ / „Leer starten“) → Aufteilung bzw. Abmachungen. Start des Plans = Einrichtungstag; änderbar nur in den Optionen ganz unten (mit Erklärung).
- Etappe 3+5 (29.10.2026): Aufgaben haben `min` (geschätzte Minuten), bei Bedarf `perMonth`, optional `steps` (Teilschritte). Aufwand/Monat = min × Häufigkeit (täglich 30, wöchentlich 4,3, 2 Wochen 2,2, monatlich 1, vierteljährlich 1/3 …, Saison anteilig) – `timesPerMonth`/`monthlyMinutes`/`loadByPerson`/`autoSplit` in logic.js. Faire Aufteilung je Intervall (`autoSplit`): gleich viele Aufgaben (±1), Minuten möglichst gleich (alle Varianten probiert), größere Hälfte an die Person mit weniger Gesamtlast; Gemeinsames/Abwechselndes je zur Hälfte.
- Einrichtung: Personen → Vorlage → (Vorschlag: Aufteilung mit Live-Bilanz, Antippen tauscht) bzw. (Leer: Abmachungen wählen) → Einladung mit QR-Code (vendored `js/qrcode.js`, MIT, lazy geladen) und Link `?join=CODE`. Beitritt per Link im Browser zeigt Hinweis zum Home-Bildschirm (iPhone: Homescreen-App hat eigenen Speicher, ggf. Code nochmal eingeben).
- „Plan neu einrichten“ (Optionen): gleicher Ablauf, ersetzt Aufgaben, Start = heute; Code, Personen-IDs, eigene Abmachungen und Verlauf bleiben.
- Teilschritte: Erledigung je Schritt als Completion `<completionId>__s<i>` mit `step`, gleicher `key`; alle erledigt → Aufgabe erledigt. Schritt-Erledigungen zählen nicht in Bilanz/Verlauf/Kalender (`watchDays` filtert `step`).
- Optionen: Vibrieren (pro Gerät `fairplan.vibrate`; Android `navigator.vibrate`, iPhone 17.4+ versteckter `<input switch>`), Backup Export/Import (JSON, `exportAll`/`importAll` im Store; Import ersetzt Aufgaben und Haushalts-Dokument, ergänzt Erledigungen; Export liest direkt vom Server, schlägt offline also fehl statt unvollständig zu sichern; zwei Schritte „Daten exportieren“ → „Datei sichern“, weil iPhone Teilen nur direkt nach einem Tippen erlaubt), Aufwand pro Monat je Person. „Alle“ zusätzlich Filter nach Intervall.
- Service Worker holt eigene Dateien mit `cache: 'no-cache'` (sonst bis 10 Min. alte Version durch GitHub-Pages-Cache).
- Vereinfacht (29.10.2026): Optionen in 4 aufklappbaren Gruppen (Wir · Aufgaben · Dieses Gerät · Haushalt). Editor: Titel, Intervall, Zuteilung, Dauer sichtbar; Tag, Termin, Saison, Hinweis, Teilschritte unter „Mehr“. „Eigenes Intervall“ und Zuteilung „Abwechselnd“ ausgeblendet (Logik kann beides noch, bestehende Aufgaben bleiben bearbeitbar; Merkliste: später mit Hinweis „morgen Sabrina“ zurück). Vorlage: „Pflanzen kontrollieren“ jetzt wöchentlich statt täglich abwechselnd. Vorlage: doppeltes „Gewand ausmisten“ (halbjährlich) entfernt.
- Bewusst später (Merkliste): Joker, Urlaubsausgleich, Pakettausch (Idee: als Belohnung).
- Nachträglich ergänzt: Bügeln (wöchentlich, A), Einkaufen (wöchentlich, B), Auto putzen und Lüftungsfilter im Bad (halbjährlich, gemeinsam).

## Neues Design (30.10.2026, v19, Vault-Notizen „Umsetzung 2026-10-30“ und „Design 2026-10-30“)
Etappen 1–6 gesammelt gebaut; Etappe 7 (Einrichtung neu) kommt extra. Gilt vor älteren Einträgen oben, wo sie sich widersprechen.
- Darstellung: `data-theme` dark/light/zart + `data-accent` = eigene Personenfarbe (localStorage `fairplan.accent`), alles über CSS-Variablen in `styles.css`. Schrift Inter über Google Fonts, sonst Systemschrift.
- Navigation: Aktuell · Plan · Statistik · Mehr (`S.view`); Unterseiten in `PAGES`, Rückweg über `S.stack`. „Alle“ ist jetzt Mehr › Aufgabenliste, „Ich bin“ entfällt, Geplant-Schalter und Monatsbilanz entfallen.
- Aktuell: Statuskarte (heute x/y; Balken = Woche Mo–So inkl. Vergessenem über `dueBetween`, nur eigene Erledigungen füllen ihn; Abmachungen = „+N Bonus“ daneben). Abschnitte Abmachungen · Aufgaben · Bei Bedarf · andere Person (Vertretung, eingeklappt) · Erledigt. Aufgaben enthält auch, was diese Woche noch kommt, damit man es vorher abhaken kann. Sortierung eigene → gemeinsame → Rhythmus.
- Serie (`streaks`): Tage in Folge mit mindestens einer eigenen Erledigung (auch Abmachung); heute darf fehlen, Abwesenheit unterbricht nicht.
- Abhaken per Tippen oder Wischen in beide Richtungen; fremde Häkchen gesperrt; eigene zurücknehmen mit Abfrage (`reopen`), auch im Plan.
- Laden: `ensureDays(from)` hält einen Erledigungs-Listener, Bereich wächst nur (Standard 62 Tage, Statistik ab Start des Plans), um im Gratis-Rahmen zu bleiben.
- Profil: `persons[].avatar` letter/animal/photo, `persons[].photo` = 160-px-JPEG als Data-URL im Haushalts-Dokument. Bestehende Daten bleiben unverändert gültig.
- Bewusst nicht gebaut: Mitteilungen und Tägliche Erinnerung (Push später).
- Feinschliff v20: Einrichtung Schritt 1 nutzt dieselben Bausteine wie das Profil (`colorGrid`, `dayChips`). Vorlage: Müll rausbringen und Pflanzen gießen bei Hitze sind Abmachungen (bestehender Plan ändert sich nicht automatisch, dort per Vorschlag antippen und alte Aufgabe löschen). Plan: gefüllter Punkt = erledigt, Ring ab heute = Putztag oder geplante Aufgaben (grau = Gemeinsames). Avatar: Tier in Personenfarbe, Kreis nach Darstellung (`--av-bg`); Buchstabe bleibt dunkel auf vollem Farbkreis. Darstellung „Zart“ heißt in der Oberfläche „Farbe“ (Wert bleibt `zart`). „Putztag/Putztage“ passt sich der Anzahl an.
- v21: Aufgaben auf Aktuell: jetzt Dranes vor „diese Woche“, darin eigene → gemeinsame → Rhythmus. Saison für Abmachungen nur über `RULE_SEASONS` in `template.js` (Pflanzen gießen bei Hitze Juni–August; kein Eingabefeld für eigene). Darstellung Auto (kein gespeichertes `fairplan.theme`): Handy dunkel → Dunkel, hell → Farbe; eigene Wahl bleibt, bis man Auto antippt.
- v22: Wer einen Haushalt anlegt, ist automatisch Person 1 (nur Beitretende werden gefragt). Statuskarte: „Alles erledigt“ nur, wenn heute etwas Eigenes erledigt wurde, sonst „Heute ist nichts dran.“ Abmelden entfernt auch `fairplan.accent` und den `?join=`-Teil der Adresse.
- v23: Abmachungen starten eingeklappt (Wahl pro Gerät: `fairplan.open-rules`). Punkte und Ringe im Plan über `--d-<farbe>` (hell/Farbe kräftig). Tagesdetail nennt Putztag ohne Aufgaben. Unterseiten und Editor nutzen `history`, damit die Zurück-Taste funktioniert.
- v24: Code und Person zusätzlich in IndexedDB (`fairplan-keep`) und Cookie, `restoreIdentity` holt sie zurück, wenn localStorage leer ist (Absicherung, Ursache am iPhone noch nicht bestätigt). „Nicht gefunden“ nur noch nach Antwort vom Server, sonst nach 15 s Hinweis auf fehlende Verbindung. Versionszeile zeigt App/Browser.
- Plan (v26): „Nächste 2 Wochen“ und Tagesdetail sortieren eigene → gemeinsame → andere, darin nach Rhythmus (`byMeFirst`).
- Abmachungen (v27): `RULE_COMMON` immer sichtbar, `RULE_GROUPS` zum Aufklappen, `RULE_SUGGESTIONS` alle; `TEMPLATE_RULES` bleibt, was die Vorlage vorauswählt. Text = Kennung, Vorschläge nicht umformulieren. Eigene Abmachungen (v28) als Knöpfe mit ×, „+ Abmachung“ öffnet eine Eingabe, die für weitere offen bleibt (`addOwnRule`). Geplant für Etappe 7: Frage „Was gibt es bei euch?“ steuert Vorschläge und Vorlage.
- `render` wartet, solange ein Finger aufliegt (`pointerDown`), sonst verschwindet der Knopf unter dem Finger und der Tipp geht verloren.
- Erledigt-Zeile (v29): „erledigt von dir/Name · Uhrzeit“ (`byWho`, `timeOf`, `forWhom`), in der Aufgabenliste mit Datum.
- v30: Während der eigenen Abwesenheit sind alle eigenen offenen Aufgaben, sonst die mit Termin in der geplanten Abwesenheit, auf „Aktuell“ und bei der Zahl am Icon ausgeblendet (`myPaused`), andere sehen sie weiter und können vertreten; in der Aufgabenliste bleiben sie sichtbar. Meilenstein „Ganzer Monat“: „läuft“ oder „geschafft“.
- Spruch: in der App „Fairplan – der Putzplan für deinen Haushalt“, für die Werbung „Fairplan – weniger diskutieren, mehr erledigt“.

## Neue Vorlage (31.10.2026, v31, Runde 1; Vault-Notizen „Vorlage“ und „Unser Plan“)
Gilt vor älteren Einträgen oben, wo sie sich widersprechen.
- Einrichtung, Schritt Vorlage (v32): „Daniel und Sabrina“ (`OUR_TASKS`, nur solange wir testen, vor Verkauf entfernen) geht direkt zur Aufteilung. „Vorschlag“: Fragen (`QUESTIONS`) → Bereiche-Auswahl mit `suggestTasks(answers)` vorausgewählt → Aufteilung. „Leer starten“: Bereiche-Auswahl ohne Auswahl → Abmachungen → Aufteilung (ohne Aufgaben direkt anlegen). `st.pick` hält die Auswahl (`on`), `area` bleibt an der Aufgabe, `when`, `soft`, `on` werden beim Anlegen entfernt. Bügeln verlängert nur die Wäsche (90 Min.); `soft` = bei passender Antwort nur angeboten (Katzenklo, Käfig/Aquarium). Rhythmuswechsel in der Auswahl setzt die Zuteilung nach `defaultAssign`.
- Aufteilung nach Zeit (`autoSplit`): von häufig nach selten wird jedes Intervall so geteilt, dass der bisherige Unterschied möglichst klein wird; bei gleichem Ergebnis gewinnt die gleichmäßigere Anzahl. Die Anzahl pro Person kann deshalb deutlich abweichen. Bei Bedarf und „Ausmisten“ sind gemeinsam, „Gewand ausmisten“ pro Person (seit v33, siehe Rotation).
- Saison optional mit zweitem Zeitraum (`from2`, `to2`), im Editor unter „Mehr“; Fenster putzen und Gewand tauschen März–Mai und Sep–Nov. `timesPerMonth` zählt bei Monatsintervallen die Perioden mit Saisonmonat (jährlich mit Saison bleibt 1× pro Jahr).
- Abmachungen: Umbenannte Vorschläge in `RULE_RENAMED`; bestehende Haushalte behalten den alten Text, bei „Plan neu einrichten“ wird er ersetzt.
- „+N extra“ statt „Bonus“ überall in der Oberfläche; Erklärzeilen unter Abmachungen und Bei Bedarf.

## Rotation (31.10.2026, v33; Vault-Notiz „Prompt Rotation“)
Gilt vor älteren Einträgen oben („Kein Pakettausch“ ist überholt, wo die Rotation eingeschaltet ist).
- `rotateFrom` im Haushalt ('YYYY-MM'): ab dem Monat danach tauschen die Pakete am 1.; `null`/fehlt = aus (bestehende Haushalte, bis der Schalter „Monatlich tauschen“ unter Mehr › Aufgaben an ist oder der Plan neu eingerichtet wird). `rotationBase`: Start weniger als 14 Tage vor dem Monatsersten überspringt diesen Tausch. Schalter aus und wieder ein beginnt die Zählung neu, Paket A ist dann wieder bei Person 1.
- `ownerOf` zählt die Tausche am Beginn der Periode (`turnsOf`): Wer dort zuständig ist, bleibt es bis zum Ende; die Woche um den 1. gehört also noch dem alten Monat. Intervalle mit gerader Monatszahl (halbjährlich, jährlich) wechseln stattdessen je Durchgang. `packageOwners(ctx, turns)` rotiert reihum.
- `task.fixed` (mit `assign` A/B): tauscht nicht mit, im Editor „Fix bei <Person>“ (Wert `fix-A`/`fix-B` nur im Formular). Zählt weiter in `loadByPerson`.
- `loadByPerson` bleibt pro Paket gerechnet: bei Tausch stimmt die Zeit nur im Schnitt. `autoSplit` läuft nur beim Einrichten, „Fix“ gleicht sich nicht von selbst aus.
- Hinweise: Statuskarte 3 Tage vorher „Tausch am …“; „Getauscht! Was schon läuft, machst du noch fertig. Danach hast du: …“ einmal pro Monat und Gerät (`fairplan.swap-seen`), nennt das Wöchentliche und „N weitere“, ohne Halbjährliches/Jährliches.
- Schalter (v34) auch in der Aufteilung (`st.rotate`): an, außer `rotateFrom === null` (bewusst aus); fehlt der Wert (alter Haushalt), gilt beim Neu-Einrichten „an“. Datum in Hinweisen ans Satzende, `fmtDate` endet je nach Jahr mit oder ohne Punkt.

## Persönliche Woche (31.10.2026, v35)
Gilt vor älteren Einträgen oben, wo sie sich widersprechen (Spielraum, Tauschtag bei Wöchentlichem, Balken Mo–So).
- Wöchentlich und alle 2 Wochen (`isRolling`) laufen vom Termin bis zum Tag vor dem nächsten Termin, ohne Spielraum (`rollingTerms`, `evaluateRolling`). Rot erst am nächsten Termin; ein Haken zählt für den laufenden Termin, wie bisher. Vorziehen ab Beginn der Kalenderperiode, sobald der laufende erledigt ist; heute Erledigtes bleibt heute „erledigt“.
- Tausch: Wöchentliches gehört der Person, deren Putztag im passenden Monat liegt (Abstand bei Mo/So: 6 und 8 Tage). Eine Kalenderwoche kann so zwei Termine haben (zweiter Schlüssel `weekly:<Montag>b`) oder keinen. Alle 2 Wochen behält einen Termin je Block mit Zuständigkeit am Blockbeginn (Abstand 20 und 8 Tage), weil die Monatsregel 6 und 22 ergäbe. Monatliches und Seltenes unverändert mit Spielraum.
- Schlüssel bleiben sonst `weekly:<Montag>`/`biweekly:<Blockbeginn>`: bisherige Erledigungen gelten weiter, nichts wird umgeschrieben.
- Statuskarte: Balken und „Deine Woche“ über `personalWeek` (ab dem ersten Putztag der Person). „heute x/y“, „Noch N offen“ und Zahl am Icon zählen nur `isPressing` (Termin und Tag danach, dazu Rotes); der Rest steht in der Liste und als „Noch N bis zum nächsten Termin“. Plan-Kalender und Statistik bleiben beim Kalender. „Ganzer Monat“ zählt über `dueBetween` die Termine im Monat, ohne eigene Änderung.
- Abwesenheit: `myPaused` blendet Wöchentliches nur aus, wenn man heute weg ist oder der Termintag in die Abwesenheit fällt; verpasst wird nachgesehen, wenn die Abwesenheit die Zeit bis zum nächsten Termin berührt.
- Editor (v36): „Termin“ bei wöchentlich bietet nur so viele Einträge wie Putztage (`putztagCount`, mit Tausch die höhere Zahl beider Personen) und ist bei einem Putztag ausgeblendet; `pos` bleibt dann gespeichert, falls später ein zweiter Putztag dazukommt.

## Gemeinsames Ziel (31.10.2026, v37; Vault-Notiz „Prompt Belohnungen“, Runde 1 von 3)
- `goal` im Haushalt `{ percent, reward }`, fehlt = 90 % ohne Belohnung (`goalOf`). Einrichten: eigener Schritt nach der Aufteilung (beim leeren Start ohne Aufgaben entfällt er), sonst Mehr › Haushalt (`goalBlock`, `setGoal`). „Plan neu einrichten“ übernimmt das bisherige Ziel.
- `goalStats`: alle Termine des Monats beider Personen, ohne Tägliches und Abmachungen; Pausiertes zählt nur, wenn es erledigt ist; Vertretung zählt. Prozent rechnen mit dem ganzen Monat und sind abgerundet.
- `goalResult` (Vormonat): `reached` = Quote erreicht, `settled` = letzte Frist vorbei (Termine laufen bis in den neuen Monat). Hinweis einmal pro Monat und Gerät (`fairplan.goal-seen`): „Geschafft! …“ sobald erreicht, „Neuer Monat, neues Ziel.“ erst nach der letzten Frist. Startmonat zählt nur mit mindestens 14 Tagen.
- `goalHits` im Haushalt `{ 'YYYY-MM': Belohnung }` hält Erreichtes fest, auch nach „Plan neu einrichten“. Meilenstein „Gemeinsames Ziel“ liest das.
- Beim Einrichten zeichnet das Textfeld nicht neu (`input` statt `change`), sonst ginge der Tipp auf „Haushalt anlegen“ beim Verlassen des Felds verloren.

## Joker (31.10.2026, v38; Runde 2)
- `joker_<personId>` im Haushalt `{ progress, count, earned, deferred: { <completionId des Termins>: Tag } }`, jede Person schreibt nur ihr Feld. 30 eigene Abmachungen = 1 Joker (`JOKER_PRICE`), höchstens 3 (`JOKER_MAX`), bei vollem Vorrat zählt nichts weiter. Frühere Abmachungen zählen nicht. Abmachung zurücknehmen rechnet zurück (`countRule`).
- Einsetzen (`canJoker`, `useJoker`, `playJoker`): eigene offene oder rote Aufgabe mit Person, nicht Tägliches und Bei Bedarf. Frist +7 Tage. Knopf in `nowRow` erst, wenn die Frist in höchstens 2 Tagen endet oder die Aufgabe rot ist. Rückgängig über den Hinweis.
- `item.termKey` = Termin, `item.key` = wohin der Haken zählt. Wöchentlich läuft die neue Runde schon: Der Eintrag bleibt beim Termin mit Joker (auch über den Tausch bei derselben Person), ein Haken zählt für die laufende Runde.
- Ziel und Balken: Verschobenes fällt raus, bis es erledigt ist; erledigt zählt es im Monat der neuen Frist. Drängt nicht (`isPressing`). Aktuell und Plan zeigen „verschoben“.
- `earned` ist für den Meilenstein „Erster Joker“ in Runde 3.

## Statistik und Stern (31.10.2026, v39; Runde 3)
Gilt vor älteren Einträgen oben („Serie“ in Tagen, sechs Meilensteine, Tier bei „Alles erledigt“).
- Serie in Wochen (`weekStreaks`): eigene Woche ab dem Putztag, zählt, wenn alle eigenen Termine erledigt sind. Ohne Termine (auch Abwesenheit, Joker) und solange eine Frist läuft: weder Bruch noch Zählung. Tägliches zählt nicht. Geurteilt wird nur ab `S.dayFrom`, auf „Aktuell“ daher „8+ Wochen“, bis die Statistik alles geladen hat.
- 8 Meilensteine (`milestones`): Erster Haken, Erste Woche geschafft, 4 Wochen Serie, Ganzer Monat, 100 Aufgaben, 100 extra, Erster Joker, Gemeinsames Ziel. `stats_<personId>` im Haushalt `{ longest, done: { id: Tag }, start }` hält Erreichtes und die längste Serie, auch nach „Plan neu einrichten“.
- `syncStats` schreibt nur bei Änderung und erst, wenn Erledigungen und Aufgaben geladen sind (`S.daysReady`). Beim ersten Mal still, danach Puls in der Statuskarte. `start` = Plan, für den der Stern „Der Anfang ist gemacht!“ schon kam; zählt nur eine Erledigung einer aktuellen Aufgabe.
- `celebrate`: Einblendung `#fx` (1,4 s, Antippen schließt), Stern als Linie in Personenfarbe, bei geschafftem Ziel mit Verlauf aus beiden Farben (`fairplan.goal-star` einmal pro Gerät), beim Joker eigenes Symbol. „Alles erledigt“ zeigt den Stern statt des Tiers. „Bewegung reduzieren“ schaltet die Animationen ab.

## Bis zu 6 Personen (31.10.2026, v40)
Gilt vor älteren Einträgen oben („Paket A/B“, „2 Personen“).
- Anlegen: Anzahl 2 bis 6 (`data-setup-count`), Farben ohne Doppelte; ändern nur über einen neuen Haushalt. Ab 3 Personen fallen „Daniel und Sabrina“ und „Vorschlag 2-Personen-Haushalt“ weg, es bleibt „Leer starten“.
- Pakete A bis F (`PACKAGES`, `isPackage`), `packageOwners` liefert die Person je Paket, Tausch reihum. `swapsByRound`: Rhythmen, die mit dem Monatstausch immer dieselben träfen (gemeinsamer Teiler von Monatszahl und Personen, bei 2 Personen wie bisher halbjährlich und jährlich), wechseln je Durchgang.
- `autoSplit(tasks, persons)`: bei 2 unverändert; ab 3 von häufig nach selten, die größte zuerst an das Paket mit der wenigsten Zeit. Eine übergroße Aufgabe (Wäsche) kann den Unterschied bestimmen, der Tausch gleicht ihn aus.
- Aufteilung: Antippen gibt die Aufgabe der nächsten Person, reihum.
- Anzeige bei vielen Personen am Handy (Kalenderpunkte, lange Tagesliste) nur am Testbild geprüft.

## Neuer Haushalt und Meine Haushalte (31.10.2026, v41)
- Personenzahl ändern heißt: neuer Haushalt mit neuem Code (`newHome`, Mehr › Haushalt oder Meine Haushalte). Der alte bleibt unverändert und bekommt `movedTo` = neuer Code. Gelöscht wird nichts.
- Andere Geräte im alten Haushalt sehen auf „Aktuell“ `movedNote` mit „Wechseln“ oder „Hier bleiben“ (`fairplan.moved-stay`), danach „Wer bist du?“.
- `fairplan.homes` = Liste nur auf diesem Gerät (`rememberHome`, `upsertHome`: code, names, me, setup), kostet keine Lesezugriffe. Unter Mehr ab 2 Einträgen, auf der Startseite wenn abgemeldet. Entfernen betrifft nur die Liste, Abmelden entfernt den aktuellen Eintrag.
- `switchHome` lädt die Seite neu, damit nichts vom anderen Haushalt übrig bleibt.
- Haushalte aller Nutzer sind bewusst nicht auflistbar (Regeln). Echtes Löschen fehlt noch: vor dem Verkauf, mit Bestätigung aller und Frist, dafür Regeln ändern.

## Start beim Einrichten (31.10.2026, v42)
- Letzter Schritt der Einrichtung (Ziel, beim leeren Start ohne Aufgaben die Abmachungen): Zeile `startLine` „Start: heute · erster Tausch am …“, „ändern“ öffnet ein Datumsfeld. Nicht in der Vergangenheit; das geht weiter unter Mehr › Start des Plans. Das Feld zeichnet nicht neu, sonst schlösse sich am iPhone die Auswahl.
- Vor dem Start zeigt die Statuskarte „Euer Plan startet am …“, nichts ist fällig oder rot. Abmachungen und Bei Bedarf gehen schon.
- Mehr › Start des Plans: Solange noch nicht getauscht wurde, rückt der erste Tausch mit (`rotationBase`), danach bleibt er.

## Offen / Ideen
- Daniel möchte die App weiter nach eigenen Wünschen optimieren.
- Später (nicht V1): mehr als 2 Personen, faire Neuaufteilung nach Aufwand.
