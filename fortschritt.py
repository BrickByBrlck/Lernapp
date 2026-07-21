"""NLFEM-Lernfortschritt anzeigen.

Aufruf:  python fortschritt.py
Rechnet nur, aendert nichts. Der Beherrschungsgrad wird in fortschritt.json
gepflegt (von Claude, nach nachgewiesener Loesung).
"""

import json
import sys
from datetime import date, timedelta
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = Path(__file__).parent
DATA = json.loads((ROOT / "fortschritt.json").read_text(encoding="utf-8"))

VOLL, LEER = "█", "░"


def balken(anteil, breite=28):
    anteil = max(0.0, min(1.0, anteil))
    n = round(anteil * breite)
    return VOLL * n + LEER * (breite - n)


def xp_fraction(concept):
    """Anteil der XP eines Konzepts, der schon erreicht ist (0..1). Hat das
    Konzept `teilaufgaben` (mehrteilige Herleitung a/b/c), zaehlt der Anteil
    der erledigten Teile -- feiner als die 3-stufige grad-Skala."""
    teilaufgaben = concept.get("teilaufgaben")
    if teilaufgaben:
        return min(1.0, sum(t["anteil"] for t in teilaufgaben if t.get("erledigt")))
    return concept["grad"] / 3


def ist_skript(concept):
    """True fuer Kurs-Konzepte, False fuer Grundlagen (typ=='grundlage')."""
    return concept.get("typ", "skript") != "grundlage"


def recent_trefferquote(kalibrierung, n=10):
    """Trefferquote der letzten n bewerteten Aufgaben (richtig=1.0, teilweise=0.5,
    falsch=0.0), gemittelt -- macht die 70-80%-Kalibrierungsregel aus CLAUDE.md
    nachpruefbar statt reinem Bauchgefuehl des Tutors in der laufenden Sitzung.
    Bewusst unabhaengig von 'vorhergesagt' (Sicherheit) -- andere Achse."""
    punkte = {"richtig": 1.0, "teilweise": 0.5, "falsch": 0.0}
    letzte = kalibrierung[-n:]
    if not letzte:
        return None
    verlauf = [punkte.get(e.get("ergebnis"), 0.0) for e in letzte]
    quote = sum(verlauf) / len(verlauf)
    return {"quote": quote, "n": len(letzte), "verlauf": verlauf}


def lerntage_zwischen(von, bis, pro_woche, pause_von=None, pause_bis=None):
    """Zaehlt verbleibende Lerntage, Pausenzeitraum ausgenommen."""
    tage = 0
    d = von
    while d <= bis:
        in_pause = pause_von and pause_bis and pause_von <= d <= pause_bis
        # Wochenende zaehlt nur anteilig: pro_woche Lerntage von 7
        if not in_pause and d.weekday() < pro_woche:
            tage += 1
        d += timedelta(days=1)
    return tage


def main():
    s = DATA["season"]
    heute = date.today()
    deadline = date.fromisoformat(s["deadline"])
    pause = s.get("pause") or {}
    p_von = date.fromisoformat(pause["von"]) if pause.get("von") else None
    p_bis = date.fromisoformat(pause["bis"]) if pause.get("bis") else None

    k = DATA["konzepte"]
    skript = [c for c in k if ist_skript(c)]
    grundlagen = [c for c in k if not ist_skript(c)]

    gesamt_xp = sum(c["xp"] for c in skript)
    erreicht_xp = sum(c["xp"] * xp_fraction(c) for c in skript)
    offen_xp = gesamt_xp - erreicht_xp

    rest_lerntage = max(1, lerntage_zwischen(
        max(heute, date.fromisoformat(s["start"])), deadline,
        s["lerntage_pro_woche"], p_von, p_bis))
    tagesziel = offen_xp / rest_lerntage

    heute_iso = heute.isoformat()
    heute_xp = sum(e["xp"] for e in DATA["log"] if e["datum"] == heute_iso)

    print()
    print(f"  \033[1m{s['name']}\033[0m  —  Ziel: {s['ziel']}")
    print(f"  Deadline {deadline.strftime('%d.%m.')}  ·  noch {rest_lerntage} Lerntage", end="")
    if p_von and heute <= p_bis:
        print(f"  ·  Pause {p_von.strftime('%d.%m.')}–{p_bis.strftime('%d.%m.')} ({pause['grund']})", end="")
    print("\n")

    # --- Tagesziel ---
    anteil_heute = heute_xp / tagesziel if tagesziel else 1.0
    farbe = "\033[32m" if anteil_heute >= 1 else "\033[33m"
    print(f"  HEUTE   {farbe}{balken(anteil_heute)}\033[0m  {heute_xp:.0f}/{tagesziel:.0f} XP", end="")
    # Tagesziel ist eine Untergrenze, kein Stopp-Signal (siehe CLAUDE.md) --
    # daher nur eine Bestaetigung, keine Aufforderung aufzuhoeren.
    print("   \033[32m✓ Tagesziel erreicht\033[0m" if anteil_heute >= 1 else "")

    # --- Season gesamt ---
    print(f"  SEASON  \033[36m{balken(erreicht_xp / gesamt_xp)}\033[0m  "
          f"{erreicht_xp:.0f}/{gesamt_xp} XP  ({erreicht_xp/gesamt_xp*100:.0f} %)")

    # --- Grundlagen (Voraussetzungen ausserhalb des Skripts, eigene Leiste) ---
    if grundlagen:
        g_gesamt = sum(c["xp"] for c in grundlagen)
        g_erreicht = sum(c["xp"] * xp_fraction(c) for c in grundlagen)
        print(f"  \033[35mGRUNDL. {balken(g_erreicht / g_gesamt)}\033[0m  "
              f"{g_erreicht:.0f}/{g_gesamt} XP  ({g_erreicht/g_gesamt*100:.0f} %)")

    st = DATA["streak"]
    print(f"\n  Streak: {st['aktuell']} Tage   (Bestwert {st['bester']})")

    # --- Trefferquote: reale Kalibrierung statt Bauchgefuehl (CLAUDE.md Ziel: 70-80%) ---
    # Bewusst getrennt von "Sicherheit" (der 1-5-Selbsteinschaetzung) -- das ist
    # eine andere Groesse (siehe CLAUDE.md-Abschnitt Kalibrierung).
    tq = recent_trefferquote(DATA.get("kalibrierung", []))
    if tq:
        im_ziel = 0.70 <= tq["quote"] <= 0.80
        farbe = "\033[32m" if im_ziel else "\033[33m"
        hinweis = "" if im_ziel else ("  → zu leicht, Stufe hoch" if tq["quote"] > 0.80 else "  → zu schwer, Stufe runter")
        symbole = "".join({1.0: "✓", 0.5: "~", 0.0: "✗"}[v] for v in tq["verlauf"])
        print(f"  Trefferquote (letzte {tq['n']}): {farbe}{tq['quote']*100:.0f} %\033[0m  "
              f"(Ziel: 70–80 %){hinweis}   [{symbole}]")

    # --- faellige Wiederholungen (Spaced Repetition) ---
    faellig = [c for c in k if c.get("naechste_wiederholung") and
               date.fromisoformat(c["naechste_wiederholung"]) <= heute]
    if faellig:
        print(f"\n  \033[35m↻ Wiederholung fällig ({len(faellig)}):\033[0m", end="")
        print("  " + ", ".join(f"[{c['ue']}] {c['name']}" for c in faellig[:4]))
        if len(faellig) > 4:
            print(f"    … und {len(faellig) - 4} weitere")

    # --- pro Uebung ---
    print("\n  " + "─" * 60)
    for ue in sorted({c["ue"] for c in k}):
        g = [c for c in k if c["ue"] == ue]
        ges, err = sum(c["xp"] for c in g), sum(c["xp"] * xp_fraction(c) for c in g)
        fertig = all(c["grad"] >= 2 for c in g)
        mark = "\033[32m✓\033[0m" if fertig else " "
        print(f"  {mark} {ue}  {balken(err/ges, 20)}  {err:>4.0f}/{ges:<3} XP")

    # --- was als naechstes ---
    offen = [c for c in k if c["grad"] < 3]
    reihenfolge = {u: i for i, u in enumerate(sorted({c["ue"] for c in k}))}
    offen.sort(key=lambda c: (reihenfolge[c["ue"]], c["xp"], -c["grad"]))

    print("\n  Als Nächstes dran (leicht → schwer):")
    budget, gezeigt = tagesziel, 0
    for c in offen:
        if gezeigt and budget <= 0:
            break
        rest = c["xp"] * (1 - xp_fraction(c))
        sym = {0: "·", 1: "◐", 2: "◕"}[c["grad"]]
        print(f"    {sym} [{c['ue']}] {c['name']}  ({rest:.0f} XP)")
        budget -= rest
        gezeigt += 1

    if not offen:
        print("\n  \033[32m🏆 SEASON 1 ABGESCHLOSSEN.\033[0m")
    print()


if __name__ == "__main__":
    main()
