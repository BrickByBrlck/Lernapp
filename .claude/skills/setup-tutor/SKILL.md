---
name: setup-tutor
description: Interviewt den Nutzer zu Fach, Kontext und Kursgliederung und generiert daraus CLAUDE.md, fortschritt.json, curriculum.md und webapp/config.json — richtet diese Lern-App-Vorlage für ein neues Fach ein. Für "richte den Tutor für mein Fach ein", "neuen Kurs anlegen", "/setup-tutor".
---

# Setup-Tutor — Wizard für ein neues Fach

Du richtest diese Lern-App-Vorlage für **ein konkretes, neues Fach** ein. Die
generischen Engine-Regeln in `CLAUDE.md` (alles unterhalb der Trennlinie
`AB HIER: ENGINE-REGELN — nicht kurs-spezifisch, bitte NICHT ändern.`) fasst
du **nicht an** — die sind fachunabhängig und bereits fertig. Du füllst
ausschließlich den Steckbrief oberhalb dieser Trennlinie in `CLAUDE.md` sowie
`fortschritt.json`, `curriculum.md` und `webapp/config.json`.

`fortschritt.json` enthält aktuell **Demo/Testdaten** (ein fiktiver
Statistik-Grundkurs, `_hinweis`-Feld erklärt warum). Diese Datei komplett
ersetzen, nicht ergänzen — die Demo-Daten dienen nur der Verifikation der
Engine selbst und werden hier nicht mehr gebraucht.

## Ablauf

**0. Material-Import (optional, zuerst fragen).** Frag, ob der Nutzer einen
Ordner mit Vorlesungsfolien/Skripten als PDF hat. Falls ja:

```
python material_import.py <ordner-mit-pdfs>
```

Das extrahiert Text nach `material/text/` (Ordnerstruktur bleibt erhalten).
Fehlt `pypdf`, sagt das Skript das explizit — dann `pip install pypdf`
vorschlagen, nicht selbst versuchen zu umgehen. PDFs ohne erkannten Text
(gescannte Folien ohne OCR) meldet das Skript einzeln als Fehler; das ist
kein Abbruchgrund für den restlichen Import.

Nach dem Import: **nicht** alle extrahierten Dateien komplett lesen (Token-
Disziplin) — mit Glob einen Überblick verschaffen (Dateinamen/Ordnerstruktur
verraten oft schon die Gliederung, z.B. `Woche3/folie02.txt`), dann gezielt
in 2-4 Dateien reinlesen (Anfang, Inhaltsverzeichnis-Folie falls vorhanden,
eine Folie aus der Mitte), um Fachbegriffe und groben Aufbau zu erfassen.
Das Ergebnis fließt in Frage 9 als **Vorschlag** ein, den der Nutzer nur noch
bestätigt oder korrigiert, statt die Gliederung komplett selbst aufzuschreiben.

Hat der Nutzer kein PDF-Material (z.B. Sprachkurs ohne Folien, oder Material
liegt schon als Text vor): diesen Schritt überspringen, direkt mit Frage 1
weiter.

**1. Interview.** Stelle diese Fragen **nacheinander**, nicht alle auf einmal
(kurze Rückfragen, keine Formularflut). Vernünftige Defaults vorschlagen, wo
möglich, aber auf echte Antwort warten:

1. Wie heißt der Kurs/das Fach? (→ `{{KURS_NAME}}`, auch `app_name` in
   `webapp/config.json` — kurz genug für eine Titelzeile, z.B. "Analysis II"
   statt "Analysis II für Physiker, WiSe 2026/27, Prof. Mustermann")
2. Kurzer Kontext: wer lernt hier, wofür, mit welchem Ziel? 1-2 Sätze reichen
   (→ `{{ROLLE_KONTEXT_1_2_SAETZE}}`, z.B. "Er bereitet sich auf die
   Klausur Mechanik I/II am 18.08. vor, hat die Vorlesung gehört, will jetzt
   gezielt Aufgaben rechnen.")
3. Eine knappe Kursbeschreibung — Stoffgebiet, Niveau (→
   `{{KURS_BESCHREIBUNG}}`)
4. Neben `material/text/*` (vorextrahierter Text, das Standard-Ablageformat)
   — gibt es weitere Materialordner (Skripte, Foliensätze, Aufgabenblätter)?
   Falls ja, welche Pfade/Namen? (→ `{{WEITERE_MATERIAL_ORDNER}}`, als
   Aufzählungspunkte im selben Stil wie die bestehende Zeile; falls nein,
   diesen Punkt aus der Liste weglassen)
5. Gibt es Musterlösungen? Wo liegen sie? (→ `{{MUSTERLOESUNGEN_BLOCK}}` —
   bei Ja einen Satz nach dem Muster "Musterlösungen liegen in `<pfad>` —
   nutze sie ausschließlich zur Korrektur nach einem eigenen Versuch, nie
   vorher." einfügen; bei Nein den Platzhalter durch einen leeren String
   ersetzen, nicht durch eine Negativ-Aussage — kein Satz ist besser als
   "es gibt keine Musterlösungen")
6. Sprache der Lerninhalte, und: braucht das Fach mathematische Notation
   (LaTeX)? Falls ja, welche Symbole/Makros werden wiederkehrend gebraucht
   (Tensor-Notation, Mengenzeichen, chemische Formeln, o.ä.)? (→
   `{{SPRACHE_UND_NOTATION_HINWEIS}}` als kurzer Absatz nach dem Muster im
   bestehenden Template; falls kein LaTeX gebraucht wird, hier einen Satz wie
   "Dieses Fach braucht keine Formelnotation — der Mathe-Darstellung-Abschnitt
   unten kann ignoriert werden." einsetzen. Die genannten Makros gehen als
   `katex_macros`-Objekt in `webapp/config.json`, siehe unten)
7. Antwortsprache des Tutors im Chat (→ `{{SPRACHE}}`, z.B. "Deutsch" oder
   "Englisch")
8. Favicon-Emoji für die Weboberfläche, ein einzelnes Zeichen (→ `favicon` in
   `webapp/config.json`, Default 🎓 wenn keine Präferenz)
9. Grober Kursaufbau: welche Blöcke/Kapitel gibt es, in welcher Reihenfolge,
   und was sind pro Block die wichtigsten 2-6 Konzepte? **Wurde in Schritt 0
   Material importiert:** einen Gliederungsvorschlag aus den gesichteten
   Dateien machen ("Sieht nach diesen Blöcken aus: ... — passt das, oder
   soll ich was ändern?") statt bei null anzufangen. Der Nutzer bestätigt
   oder korrigiert, tippt nicht alles selbst. **Ohne Material:** normal nach
   einer groben Liste fragen, keine Roman-Antwort nötig — Feinschliff
   passiert später sowieso laufend beim Lernen selbst (→ Grundlage für
   `konzepte` in `fortschritt.json` und für `curriculum.md`)
10. Deadline/Klausurtermin (falls vorhanden) und wie viele Tage pro Woche
    realistisch gelernt wird, plus eventuelle Lernpausen (Urlaub o.ä.) (→
    `season.deadline`, `season.lerntage_pro_woche`, `season.pause`)

**2. `CLAUDE.md` Steckbrief ausfüllen.** Ersetze alle `{{PLATZHALTER}}` im
Kopf der Datei 1:1 mit den Interview-Antworten. Nichts unterhalb der
Engine-Regeln verändern. Bleiben nach dem Ersetzen noch geschweifte
Doppelklammern übrig, ist ein Platzhalter vergessen worden — nachfassen,
nicht mit leerem Text überschreiben.

**3. `fortschritt.json` neu aufbauen** (komplette Datei ersetzen, nicht
mergen):

```json
{
  "season": {
    "name": "<Kursname>",
    "ziel": "<kurzes, konkretes Ziel, z.B. 'Klausur bestehen' oder 'Block 3 gemeistert'>",
    "start": "<heutiges Datum, JJJJ-MM-TT>",
    "deadline": "<Interview-Antwort, JJJJ-MM-TT>",
    "lerntage_pro_woche": <Interview-Antwort>,
    "pause": null  oder {"von": "JJJJ-MM-TT", "bis": "JJJJ-MM-TT"}
  },
  "skala": {
    "0": "nicht angefangen",
    "1": "wackelig - schonmal gesehen, noch nicht selbst geloest",
    "2": "sitzt - selbststaendig geloest",
    "3": "sicher - geloest und kann es erklaeren"
  },
  "streak": {"aktuell": 0, "bester": 0, "letzter_lerntag": null},
  "log": [],
  "konzepte": [
    {
      "id": "<block_kurzname_konzept_kurzname, snake_case, eindeutig>",
      "ue": "<Blockname aus Punkt 9 des Interviews, woertlich>",
      "typ": "skript",
      "name": "<Konzeptname>",
      "xp": <1-3, nach Schwierigkeit/Umfang, nicht alles gleich>,
      "grad": 0,
      "naechste_wiederholung": null,
      "wdh_stufe": 0
    }
  ],
  "wdh_intervalle_tage": [3, 7, 14, 30],
  "kalibrierung": []
}
```

Regeln dafür:
- **Ein Eintrag pro genanntem Konzept**, `ue` exakt der Blockname aus dem
  Interview (keine Umbenennung in "U1"/"Woche1" o.ä. — das war der alte,
  jetzt behobene Bug, siehe `webapp/kompetenzbaum.js`/`app.js`: die
  Block-Reihenfolge wird zur Laufzeit aus den tatsächlichen `ue`-Werten
  abgeleitet, in Erstauftrittsreihenfolge).
- `id` muss eindeutig und stabil sein (wird u.a. für `abhaengig_von`
  referenziert) — Format `<kurzblock>_<kurzkonzept>` in snake_case.
- Setze `abhaengig_von: ["<id>", ...]` nur, wenn der Nutzer im Interview eine
  echte inhaltliche Abhängigkeit genannt hat oder sie aus der Reihenfolge
  offensichtlich ist (z.B. Grundbegriff vor Anwendung im selben Block) — nicht
  jeden Block stur an den vorigen ketten, das verstopft den Kompetenzbaum.
- **Keine** `grundlage_*`-Einträge hier anlegen — die entstehen laut den
  Engine-Regeln erst live während des Lernens, wenn eine echte Lücke
  auffällt.
- Alles startet bei `grad: 0`, `naechste_wiederholung: null` — es ist ein
  frischer Kurs, keine Lerngeschichte zu simulieren.

**4. `curriculum.md`** mit der Blockübersicht aus Punkt 9 füllen (Blockname
+ 1 Zeile Stichpunkte pro Block, keine Doppelung des vollen Detailgrads aus
`fortschritt.json`).

**5. `webapp/config.json`:**
```json
{
  "app_name": "<Kursname, kurz>",
  "favicon": "<Emoji aus Interview>",
  "katex_macros": { "\\<name>": "<LaTeX-Ersetzung>", ... }
}
```
`katex_macros` bleibt `{}`, wenn das Fach keine eigene Notation braucht —
nicht die Tensor-Makros aus der Demo übernehmen, die waren fachspezifisch
fürs Ursprungsfach.

**6. `lernstand.md` und `fehlerlog.md` auf den Leerzustand zurücksetzen**
(falls sie noch Reste einer vorherigen Kurseinrichtung enthalten) — beide
Dateien existieren schon als leere Vorlagen im Repo, im Zweifel deren
aktuellen Inhalt als Referenz für die richtige Leerform nehmen.

## Validierung vor Abschluss

- `python -c "import json; json.load(open('fortschritt.json', encoding='utf-8'))"`
  — muss fehlerfrei durchlaufen.
- `python -c "import json; json.load(open('webapp/config.json', encoding='utf-8'))"`
  — muss fehlerfrei durchlaufen.
- In `CLAUDE.md` nach `{{` suchen (`grep -c '{{' CLAUDE.md`) — muss `0`
  ergeben, sonst wurde ein Platzhalter vergessen.
- Alle `abhaengig_von`-IDs müssen auf tatsächlich existierende `konzepte`-IDs
  zeigen (keine toten Verweise).
- Kurz `python app.py` starten, `curl http://127.0.0.1:5057/api/status` und
  `curl http://127.0.0.1:5057/kompetenzbaum` prüfen (200, sinnvolles JSON),
  danach Server wieder beenden.

## Am Ende

Kurze Zusammenfassung im Chat: Kursname, Anzahl angelegter Konzepte, Deadline,
Tagesziel-Berechnung greift automatisch. Hinweis, dass `python app.py`
jetzt startklar ist und die erste Aufgabe direkt im Chat der Webapp beginnen
kann.
