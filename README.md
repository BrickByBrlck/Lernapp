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
- [ ] Phase 3: Setup-Skill (`/setup-tutor`), der `CLAUDE.md` + `fortschritt.json` aus
      einem Interview generiert
- [ ] Phase 5: Wizard gegen ein fachfremdes Beispiel testen
- [ ] Screenshots/Demo-GIF, Quickstart-Anleitung ausformulieren

## Quickstart (aktuell, vor dem Setup-Skill)

```
pip install anthropic  # oder: Claude Code CLI separat installiert & eingeloggt
python app.py
```

Öffnet `http://127.0.0.1:5057`. `fortschritt.json` in diesem Repo ist ein **Demo-Datensatz**
(Statistik-Grundkurs) — für einen echten Kurs `CLAUDE.md` und `fortschritt.json` anpassen
(oder auf den Setup-Skill warten).

## Lizenz

MIT (siehe `LICENSE`) — die Engine ist bewusst offen; siehe README-Historie/Notizen für
den geplanten Vertriebsansatz (Engine offen, optionales Pro-Paket mit fertigen
Beispiel-Configs).
