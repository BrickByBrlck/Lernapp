# Claude Course Tutor (Template) — WORK IN PROGRESS

> Dieses Repo ist die generische Vorlage, extrahiert aus einem funktionierenden
> Claude-Code-Lern-Tutor. Aktueller Stand: Engine-Bereinigung läuft (siehe unten),
> noch nicht release-fertig.

## Was ist das

Ein lokaler Web-Tutor, der über `CLAUDE.md`-Regeln gesteuert wird: XP mit fairem
Anteils-Delta, Teilaufgaben-Partialcredit, automatische Grundlagen-Lücken-Erkennung,
Spaced Repetition, Interleaving, und eine von der Selbsteinschätzung getrennte,
hinweis-basierte Trefferquote statt Bauchgefühl. Läuft mit deinem eigenen Claude-Abo.

## TODO vor Release

- [ ] Phase 1: `webapp/config.json` einbinden (Branding + KaTeX-Makros dynamisch),
      hartkodierte Übungs-Reihenfolge in `kompetenzbaum.js`/`app.js` dynamisch machen
- [x] Phase 3: Setup-Skill (`/setup-tutor`), der `CLAUDE.md` + `fortschritt.json` aus
      einem Interview generiert
- [x] Phase 5: Wizard gegen ein fachfremdes Beispiel testen
- [ ] Screenshots/Demo-GIF, Quickstart-Anleitung ausformulieren

## Quickstart

```
pip install anthropic  # oder: Claude Code CLI separat installiert & eingeloggt
claude                 # im Repo-Verzeichnis, dann:
/setup-tutor            # interviewt dich zu Fach, Kontext und Kursgliederung
python app.py
```

Öffnet `http://127.0.0.1:5057`. `/setup-tutor` (siehe
`.claude/skills/setup-tutor/SKILL.md`) füllt `CLAUDE.md`, `fortschritt.json`,
`curriculum.md` und `webapp/config.json` (Branding, Favicon, KaTeX-Makros) für dein
Fach aus — die Engine-Regeln in `CLAUDE.md` bleiben dabei unangetastet.
`fortschritt.json` in diesem Repo ist bis dahin ein **Demo-Datensatz**
(Statistik-Grundkurs), der bewusst absichtlich generisch gehalten ist, um Bugs wie
hartkodierte Übungslabels aufzudecken — nicht mit echten Kursdaten verwechseln.

## Lizenz

MIT (siehe `LICENSE`) — die Engine ist bewusst offen; siehe README-Historie/Notizen für
den geplanten Vertriebsansatz (Engine offen, optionales Pro-Paket mit fertigen
Beispiel-Configs).
