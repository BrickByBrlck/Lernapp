# Claude Course Tutor (Template) — WORK IN PROGRESS

> Dieses Repo ist die generische Vorlage, extrahiert aus einem funktionierenden
> Claude-Code-Lern-Tutor. Aktueller Stand: Engine-Bereinigung läuft (siehe unten),
> noch nicht release-fertig.

## Was ist das

Ein lokaler Web-Tutor, der über `CLAUDE.md`-Regeln gesteuert wird: XP mit fairem
Anteils-Delta, Teilaufgaben-Partialcredit, automatische Grundlagen-Lücken-Erkennung,
Spaced Repetition, Interleaving, und eine von der Selbsteinschätzung getrennte,
hinweis-basierte Trefferquote statt Bauchgefühl. Läuft mit deinem eigenen Claude-Abo.

## Wie es funktioniert

**XP-Delta-Formel.** XP gibt es nur für nachgewiesene Konzepte, nie für Zeit oder
Anwesenheit. Jeder `log`-Eintrag ist bewusst der **Anteils-Delta**, nicht der volle
Konzeptwert: `xp_konzept × (neuer_anteil − alter_anteil)`, wobei `anteil = grad/3`.
Grad 0→2 bei einem 2-XP-Konzept ergibt also `2 × (2/3 − 0) ≈ 1.33` XP, nicht 2 — nur
ein Sprung von 0 auf 3 in einem Schritt zahlt den vollen Wert aus.

**Teilaufgaben-Partialcredit.** Aufgaben mit echten, benannten Teilschritten können
`teilaufgaben` mit `anteil`-Gewichten (Summe 1.0) führen. Damit wird XP aus der Summe
erledigter Anteile berechnet statt grob aus `grad/3` — sichtbarer Fortschritt bei
mehrteiligen, mehrtägigen Aufgaben, ohne künstlich in Mini-Häppchen zu zerlegen.

**Grundlagen-Lücken-Tracking.** Blockiert eine Voraussetzung außerhalb des eigentlichen
Kursstoffs den Fortschritt, legt der Tutor dafür ein eigenes `grundlage_*`-Konzept an
(`ue: "Grundlagen"`) — eigene Leiste, eigene Wiederholungsplanung, automatisch verknüpft
über `abhaengig_von`, ohne die Hauptsummen zu verfälschen.

**Spaced Repetition.** Jedes Konzept hat `naechste_wiederholung` und `wdh_stufe`
(Intervalle `[3, 7, 14, 30]` Tage). Erstmals `grad ≥ 2` → Fälligkeit in 3 Tagen;
bestandene Wiederholung erhöht die Stufe und verlängert das Intervall; gescheiterte
Wiederholung senkt `grad` und setzt die Stufe zurück.

**Interleaving.** Etwa jede 3.–5. Aufgabe baut unangekündigt ein bereits gemeistertes
Konzept aus einem anderen Kursteil ein — zusätzlich zur termingebundenen Wiederholung,
für Transfer über den aktuellen Stoff hinaus.

**Trefferquote vs. Kalibrierung.** Zwei bewusst getrennte Größen: die **Trefferquote**
richtet sich strikt nach der Anzahl gebrauchter Hinweise (richtig/teilweise/falsch,
unabhängig vom Bauchgefühl) und steuert die Aufgaben-Schwierigkeit (70–80 % Zielkorridor).
Die **Kalibrierung** vergleicht die vorab abgefragte Selbsteinschätzung (1–5) mit diesem
Ergebnis — sichtbar auf `/stats`, aber ohne Einfluss auf die Schwierigkeitssteuerung.

## TODO vor Release

- [x] Phase 1: `webapp/config.json` einbinden (Branding + KaTeX-Makros dynamisch),
      hartkodierte Übungs-Reihenfolge in `kompetenzbaum.js`/`app.js` dynamisch machen
- [x] Phase 3: Setup-Skill (`/setup-tutor`), der `CLAUDE.md` + `fortschritt.json` aus
      einem Interview generiert
- [x] Phase 5: Wizard gegen ein fachfremdes Beispiel testen
- [ ] Screenshots/Demo-GIF, Quickstart-Anleitung ausformulieren

## Quickstart

```
pip install pypdf       # nur fuer den PDF-Import, siehe unten -- optional
claude                  # im Repo-Verzeichnis, dann:
/setup-tutor             # interviewt dich zu Fach, Kontext und Kursgliederung
python app.py
```

Öffnet `http://127.0.0.1:5057`. `/setup-tutor` (siehe
`.claude/skills/setup-tutor/SKILL.md`) füllt `CLAUDE.md`, `fortschritt.json`,
`curriculum.md` und `webapp/config.json` (Branding, Favicon, KaTeX-Makros) für dein
Fach aus — die Engine-Regeln in `CLAUDE.md` bleiben dabei unangetastet.
`fortschritt.json` in diesem Repo ist bis dahin ein **Demo-Datensatz**
(Statistik-Grundkurs), der bewusst absichtlich generisch gehalten ist, um Bugs wie
hartkodierte Übungslabels aufzudecken — nicht mit echten Kursdaten verwechseln.

Hast du Vorlesungsfolien als PDF, extrahiert `material_import.py` deren Text
nach `material/text/`, bevor `/setup-tutor` läuft — dann schlägt der Wizard
die Kursgliederung aus dem Material vor, statt dass du sie von Hand eintippst:

```
pip install pypdf
python material_import.py "C:\Pfad\zu\den\Folien"
```

Voraussetzung für `/setup-tutor` bzw. den Chat-Tutor selbst: ein Claude-Zugang,
der Claude Code freischaltet (Pro-Abo oder höher, kein API-Key nötig) — die App
läuft komplett lokal mit deiner eigenen Anmeldung, kein separates Konto bei uns.

## Lizenz

MIT (siehe `LICENSE`) — die Engine ist bewusst offen; siehe README-Historie/Notizen für
den geplanten Vertriebsansatz (Engine offen, optionales Pro-Paket mit fertigen
Beispiel-Configs).
