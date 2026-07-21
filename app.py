"""NLFEM Lern-App - lokaler Server.

Startet einen kleinen HTTP-Server (nur Python-Standardbibliothek, keine
Abhaengigkeiten) der die Weboberflaeche in webapp/ ausliefert und im
Hintergrund `claude -p` aufruft - dieselbe Anmeldung (Abo, kein API-Key)
wie die interaktive `claude`-Sitzung.

Start: python app.py  (oder ueber den Anaconda-Interpreter, siehe CLAUDE.md)
Dann im Browser: http://127.0.0.1:5057
"""

import json
import shutil
import subprocess
import threading
import webbrowser
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).parent
WEBAPP_DIR = ROOT / "webapp"
SESSION_FILE = ROOT / ".webapp_session.json"
CHAT_HISTORY_FILE = ROOT / ".webapp_chat_history.json"
AKTUELL_MD = ROOT / "aufgaben" / "aktuell.md"
ERLEDIGT_DIR = ROOT / "aufgaben" / "erledigt"
FORTSCHRITT_JSON = ROOT / "fortschritt.json"
FEHLERLOG_MD = ROOT / "fehlerlog.md"
PORT = 5057
MAX_CHAT_HISTORY = 300
CLAUDE_TIMEOUT_SECONDS = 300

CLAUDE_EXE = shutil.which("claude") or str(Path.home() / ".local" / "bin" / "claude.exe")

# Diese Werkzeuge braucht der Tutor laut CLAUDE.md (lesen, Aufgaben/Fortschritt
# schreiben, Loesungen verifizieren, Material durchsuchen). Ohne diese Freigabe
# wuerde `claude -p` beim ersten Werkzeugaufruf auf eine Erlaubnis warten, die
# im Headless-Modus (kein Terminal) nie kommt.
ALLOWED_TOOLS = "Read,Write,Edit,Bash,Glob,Grep"

_history_lock = threading.Lock()
_send_lock = threading.Lock()
_archiv_frage_lock = threading.Lock()  # eigene Sperre -- Chat und Archiv-Rueckfrage sollen sich nicht blockieren


def load_session_id():
    if SESSION_FILE.exists():
        try:
            return json.loads(SESSION_FILE.read_text(encoding="utf-8")).get("session_id")
        except (json.JSONDecodeError, OSError):
            return None
    return None


def save_session_id(session_id):
    SESSION_FILE.write_text(json.dumps({"session_id": session_id}), encoding="utf-8")


# ---------- Chat-Verlauf (bleibt ueber Browser-Neuladen hinweg erhalten) ----------

def load_chat_history():
    if not CHAT_HISTORY_FILE.exists():
        return []
    try:
        return json.loads(CHAT_HISTORY_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []


def append_chat_history(role, text):
    with _history_lock:
        history = load_chat_history()
        history.append({"role": role, "text": text})
        history = history[-MAX_CHAT_HISTORY:]
        CHAT_HISTORY_FILE.write_text(json.dumps(history, ensure_ascii=False), encoding="utf-8")


# ---------- Fortschrittsrechnung (geteilt mit fortschritt.py) ----------

def xp_fraction(concept):
    """Anteil der XP eines Konzepts, der schon erreicht ist (0..1).

    Hat das Konzept `teilaufgaben` (z.B. eine mehrteilige Herleitung a/b/c),
    zaehlt der Anteil der erledigten Teilaufgaben -- feiner als die
    3-stufige grad-Skala. Sonst wie bisher: grad/3."""
    teilaufgaben = concept.get("teilaufgaben")
    if teilaufgaben:
        return min(1.0, sum(t["anteil"] for t in teilaufgaben if t.get("erledigt")))
    return concept["grad"] / 3


def ist_skript(concept):
    """True fuer normale Kurs-Konzepte, False fuer Grundlagen (typ=='grundlage').
    Season-1-Summen zaehlen nur Skript-Konzepte -- Grundlagen laufen in einer
    eigenen Leiste, siehe CLAUDE.md Abschnitt 'Grundlagen'."""
    return concept.get("typ", "skript") != "grundlage"


def annotate_xp_anteil(konzepte):
    """Ergaenzt jedes Konzept um xp_anteil (0..1) -- damit Frontend die
    xp_fraction()-Logik nicht mehr selbst duplizieren muss (frueher in
    app.js UND stats.js separat nachgebaut, Sync-Risiko bei Aenderungen)."""
    for c in konzepte:
        c["xp_anteil"] = xp_fraction(c)
    return konzepte


def season_summen(konzepte):
    skript = [c for c in konzepte if ist_skript(c)]
    gesamt_xp = sum(c["xp"] for c in skript)
    erreicht_xp = sum(c["xp"] * xp_fraction(c) for c in skript)
    return gesamt_xp, erreicht_xp


def grundlagen_summen(konzepte):
    grundlagen = [c for c in konzepte if not ist_skript(c)]
    gesamt_xp = sum(c["xp"] for c in grundlagen)
    erreicht_xp = sum(c["xp"] * xp_fraction(c) for c in grundlagen)
    return gesamt_xp, erreicht_xp


def lerntage_zwischen(von, bis, pro_woche, pause_von=None, pause_bis=None):
    tage, d = 0, von
    while d <= bis:
        in_pause = pause_von and pause_bis and pause_von <= d <= pause_bis
        if not in_pause and d.weekday() < pro_woche:
            tage += 1
        d += timedelta(days=1)
    return tage


def compute_tagesziel(data):
    s = data["season"]
    heute = date.today()
    deadline = date.fromisoformat(s["deadline"])
    pause = s.get("pause") or {}
    p_von = date.fromisoformat(pause["von"]) if pause.get("von") else None
    p_bis = date.fromisoformat(pause["bis"]) if pause.get("bis") else None

    gesamt_xp, erreicht_xp = season_summen(data["konzepte"])
    offen_xp = gesamt_xp - erreicht_xp

    rest_lerntage = max(1, lerntage_zwischen(
        max(heute, date.fromisoformat(s["start"])), deadline,
        s["lerntage_pro_woche"], p_von, p_bis))
    return offen_xp / rest_lerntage


def compute_daily_xp(log, days=14):
    """Taeglich verdiente XP der letzten `days` Tage, mit Nullen aufgefuellt."""
    totals = {}
    for e in log:
        totals[e["datum"]] = totals.get(e["datum"], 0) + e["xp"]
    heute = date.today()
    return [
        {
            "datum": (heute - timedelta(days=i)).isoformat(),
            "tag": (heute - timedelta(days=i)).strftime("%a"),
            "xp": totals.get((heute - timedelta(days=i)).isoformat(), 0),
        }
        for i in range(days - 1, -1, -1)
    ]


def heute_plus(tage):
    return date.today() + timedelta(days=tage)


def compute_weekly_xp(log, weeks=8):
    """Woechentlich verdiente XP der letzten `weeks` Kalenderwochen (Montag-Start),
    mit Nullen aufgefuellt."""
    totals = {}
    for e in log:
        d = date.fromisoformat(e["datum"])
        monday = d - timedelta(days=d.weekday())
        totals[monday.isoformat()] = totals.get(monday.isoformat(), 0) + e["xp"]

    heute = date.today()
    this_monday = heute - timedelta(days=heute.weekday())
    return [
        {
            "woche_start": (this_monday - timedelta(weeks=i)).isoformat(),
            "xp": totals.get((this_monday - timedelta(weeks=i)).isoformat(), 0),
        }
        for i in range(weeks - 1, -1, -1)
    ]


def compute_wochenvergleich(weekly):
    """Diese Woche vs. letzte Woche -- fuer den Wochenrueckblick."""
    if len(weekly) < 2:
        diese_woche = weekly[-1]["xp"] if weekly else 0
        return {"diese_woche": diese_woche, "letzte_woche": 0, "differenz": diese_woche}
    diese, letzte = weekly[-1]["xp"], weekly[-2]["xp"]
    return {"diese_woche": diese, "letzte_woche": letzte, "differenz": diese - letzte}


def recent_trefferquote(kalibrierung, n=10):
    """Trefferquote der letzten n bewerteten Aufgaben -- macht die 70-80%-
    Kalibrierungsregel aus CLAUDE.md nachpruefbar statt reinem Bauchgefuehl.
    Bewusst UNABHAENGIG von 'vorhergesagt' (der Sicherheits-Einschaetzung) --
    das ist eine andere Achse, siehe compute_calibration(). 'verlauf' liefert
    die Einzelwerte in Reihenfolge fuers Diagramm (nicht nur den Schnitt), damit
    sichtbar wird OB die letzten Aufgaben eher durchwachsen oder gleichmaessig
    liefen -- ein Schnitt allein verschleiert das. Gleiche Grundrechnung wie in
    fortschritt.py, dort fuers Terminal."""
    punkte = {"richtig": 1.0, "teilweise": 0.5, "falsch": 0.0}
    letzte = kalibrierung[-n:]
    if not letzte:
        return None
    verlauf = [
        {"konzept_id": e.get("konzept_id"), "ergebnis": e.get("ergebnis"),
         "score": punkte.get(e.get("ergebnis"), 0.0)}
        for e in letzte
    ]
    quote = sum(v["score"] for v in verlauf) / len(verlauf)
    return {"quote": quote, "n": len(letzte), "verlauf": verlauf}


def compute_calibration(kalibrierung):
    """Vorhergesagte Sicherheit (1-5) vs. tatsaechliche Trefferquote je Stufe.
    'richtig'=1.0, 'teilweise'=0.5, 'falsch'=0.0 Punkte, gemittelt pro Stufe."""
    punkte = {"richtig": 1.0, "teilweise": 0.5, "falsch": 0.0}
    gruppen = {}
    for e in kalibrierung:
        gruppen.setdefault(e["vorhergesagt"], []).append(punkte.get(e.get("ergebnis"), 0.0))
    return [
        {
            "stufe": stufe,
            "anzahl": len(gruppen.get(stufe, [])),
            "trefferquote": (sum(gruppen[stufe]) / len(gruppen[stufe])) if gruppen.get(stufe) else None,
        }
        for stufe in range(1, 6)
    ]


def compute_pace(data, gesamt_xp, erreicht_xp):
    """Tempo-Prognose: XP/Tag im Schnitt seit Season-Start, projiziertes Enddatum."""
    start = date.fromisoformat(data["season"]["start"])
    tage_seit_start = max(1, (date.today() - start).days + 1)
    xp_pro_tag = erreicht_xp / tage_seit_start

    if xp_pro_tag <= 0:
        return {"xp_pro_tag": 0, "projiziertes_ende": None, "im_plan": None}

    offen_xp = gesamt_xp - erreicht_xp
    rest_tage = offen_xp / xp_pro_tag
    projiziertes_ende = heute_plus(round(rest_tage))
    deadline = date.fromisoformat(data["season"]["deadline"])
    return {
        "xp_pro_tag": round(xp_pro_tag, 2),
        "projiziertes_ende": projiziertes_ende.isoformat(),
        "im_plan": projiziertes_ende <= deadline,
    }


def compute_badges(data, gesamt_xp, erreicht_xp):
    """Meilenstein-Abzeichen -- dynamisch aus dem aktuellen Stand berechnet,
    nicht in fortschritt.json persistiert (keine zusaetzliche Datenpflege noetig)."""
    konzepte = data["konzepte"]
    log = data.get("log", [])
    streak = data.get("streak", {})
    uebungen = sorted({c["ue"] for c in konzepte if ist_skript(c)})
    uebung_gemeistert = any(
        all(c["grad"] >= 2 for c in konzepte if c["ue"] == ue) for ue in uebungen
    )
    grundlage_gemeistert = any(c["grad"] >= 2 for c in konzepte if not ist_skript(c))

    return [
        {"id": "erster_schritt", "titel": "Erster Schritt",
         "beschreibung": "Die erste XP verdient.", "erreicht": len(log) > 0},
        {"id": "serientaeter", "titel": "Serientäter",
         "beschreibung": "7 Tage Streak erreicht.", "erreicht": streak.get("bester", 0) >= 7},
        {"id": "uebung_gemeistert", "titel": "Übung gemeistert",
         "beschreibung": "Eine ganze Übung auf Grad ≥ 2.", "erreicht": uebung_gemeistert},
        {"id": "season_halbzeit", "titel": "Season-Halbzeit",
         "beschreibung": "50% von Season 1 erreicht.",
         "erreicht": gesamt_xp > 0 and erreicht_xp >= gesamt_xp / 2},
        {"id": "season_komplett", "titel": "Season 1 komplett",
         "beschreibung": "Season 1 vollständig gemeistert.",
         "erreicht": gesamt_xp > 0 and erreicht_xp >= gesamt_xp},
        {"id": "grundlagen_fuchs", "titel": "Grundlagen-Fuchs",
         "beschreibung": "Eine Grundlage auf Grad ≥ 2.", "erreicht": grundlage_gemeistert},
    ]


def count_fehlerlog_offen():
    """Grobe, robuste Zaehlung: jeder Eintrag im 'Offen'-Abschnitt endet auf
    eine Zeile mit '· Zuletzt:'. Kein vollwertiger Markdown-Parser noetig."""
    if not FEHLERLOG_MD.exists():
        return 0
    text = FEHLERLOG_MD.read_text(encoding="utf-8")
    if "## Offen" not in text:
        return 0
    section = text.split("## Offen", 1)[1].split("\n## ", 1)[0]
    return section.count("· Zuletzt:")


def read_grades():
    """{konzept_id: grad} - fuer den Level-Up-Vergleich vor/nach einer Nachricht."""
    try:
        data = json.loads(FORTSCHRITT_JSON.read_text(encoding="utf-8"))
        return {c["id"]: c["grad"] for c in data["konzepte"]}
    except (json.JSONDecodeError, OSError, KeyError):
        return {}


def diff_level_ups(before_grades, after_data):
    ups = []
    for c in after_data.get("konzepte", []):
        alt = before_grades.get(c["id"])
        if alt is not None and c["grad"] > alt:
            ups.append({"id": c["id"], "ue": c["ue"], "name": c["name"], "von": alt, "nach": c["grad"]})
    return ups


# ---------- Archiv abgeschlossener Aufgaben ----------

def list_archiv():
    if not ERLEDIGT_DIR.exists():
        return []
    # Sortierung nach mtime, nicht nach Dateiname: mehrere an einem Tag
    # abgeschlossene Aufgaben teilen sich das Datumspraefix, dann sortiert
    # der Dateiname nur noch alphabetisch nach Thema -- das trifft die
    # tatsaechliche Reihenfolge nur zufaellig. mtime ist der Moment, in dem
    # die Datei tatsaechlich ins Archiv geschrieben wurde.
    files = sorted(ERLEDIGT_DIR.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)
    result = []
    for f in files:
        name = f.name
        stem = name[:-3]
        ist_datiert = len(stem) >= 11 and stem[4] == "-" and stem[7] == "-" and stem[:4].isdigit()
        datum = stem[:10] if ist_datiert else None
        thema = stem[11:].replace("-", " ") if ist_datiert else stem.replace("-", " ")
        result.append({"name": name, "datum": datum, "thema": thema or name})
    return result


def build_claude_cmd(message, session_id):
    cmd = [
        CLAUDE_EXE, "-p", message,
        # Vincents globale ~/.claude/settings.json setzt "model": "opus" --
        # ohne explizites --model haette JEDER Aufruf hier auf Opus gelaufen
        # (langsamer, teurer), obwohl Sonnet fuer diesen strukturierten
        # Lernloop laengst als Zielmodell vorgesehen war. --fallback-model
        # faengt Ueberlastung ab, ohne die Standardgeschwindigkeit zu kosten.
        "--model", "sonnet", "--fallback-model", "opus",
        "--output-format", "stream-json", "--verbose", "--include-partial-messages",
        "--allowedTools", ALLOWED_TOOLS,
    ]
    if session_id:
        cmd += ["--resume", session_id]
    return cmd


def build_archiv_frage_prompt(name, inhalt, frage):
    return (
        f"Ich schaue mir gerade eine bereits abgeschlossene Aufgabe aus dem Archiv an "
        f"(Datei aufgaben/erledigt/{name}) und habe dazu noch eine kurze Rückfrage — "
        f"keine neue Aufgabe, nur eine Erklärung zum Verständnis.\n\n"
        f"--- Inhalt der archivierten Aufgabe ---\n{inhalt}\n--- Ende ---\n\n"
        f"Meine Frage dazu: {frage}\n\n"
        f"Bitte direkt erklären (kein 10-Zeilen-Limit hier, aber auch keine neue Aufgabe "
        f"stellen und keine Datei ändern)."
    )


def build_archiv_frage_cmd(prompt):
    # Bewusst zustandslos (--no-session-persistence, kein --resume): jede
    # Rueckfrage ist ein eigenstaendiger Aufruf, unabhaengig von der
    # Haupt-Tutor-Sitzung (die soll dadurch nicht mitwachsen -- siehe die
    # Latenz-Problematik von "Neue Sitzung"). Auch keine Tools erlaubt: der
    # komplette Aufgabeninhalt steht schon im Prompt, ein Read/Grep-Umweg
    # waere hier nur unnoetige Wartezeit.
    return [
        CLAUDE_EXE, "-p", prompt,
        "--model", "sonnet", "--fallback-model", "opus",
        "--output-format", "stream-json", "--verbose", "--include-partial-messages",
        "--allowedTools", "",
        "--no-session-persistence",
    ]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass  # Konsole ruhig halten

    # ---------- Statische Dateien ----------

    def _serve_file(self, relpath, content_type):
        try:
            content = (WEBAPP_DIR / relpath).read_bytes()
        except FileNotFoundError:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        parsed = urlsplit(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        routes = {
            "/": ("index.html", "text/html; charset=utf-8"),
            "/index.html": ("index.html", "text/html; charset=utf-8"),
            "/style.css": ("style.css", "text/css; charset=utf-8"),
            "/app.js": ("app.js", "application/javascript; charset=utf-8"),
            "/icons.js": ("icons.js", "application/javascript; charset=utf-8"),
            "/stats": ("stats.html", "text/html; charset=utf-8"),
            "/stats.html": ("stats.html", "text/html; charset=utf-8"),
            "/stats.js": ("stats.js", "application/javascript; charset=utf-8"),
            "/archiv": ("archiv.html", "text/html; charset=utf-8"),
            "/archiv.html": ("archiv.html", "text/html; charset=utf-8"),
            "/archiv.js": ("archiv.js", "application/javascript; charset=utf-8"),
            "/kompetenzbaum": ("kompetenzbaum.html", "text/html; charset=utf-8"),
            "/kompetenzbaum.html": ("kompetenzbaum.html", "text/html; charset=utf-8"),
            "/kompetenzbaum.js": ("kompetenzbaum.js", "application/javascript; charset=utf-8"),
        }
        if path in routes:
            self._serve_file(*routes[path])
        elif path == "/api/status":
            self._handle_status()
        elif path == "/api/stats":
            self._handle_stats()
        elif path == "/api/history":
            self._handle_history()
        elif path == "/api/archiv":
            self._handle_archiv_list()
        elif path == "/api/archiv-datei":
            self._handle_archiv_datei(qs)
        elif path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
        else:
            self.send_error(404)

    def _json_response(self, obj):
        payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _handle_status(self):
        aktuell_md = AKTUELL_MD.read_text(encoding="utf-8") if AKTUELL_MD.exists() else ""
        fortschritt = json.loads(FORTSCHRITT_JSON.read_text(encoding="utf-8"))
        k = annotate_xp_anteil(fortschritt["konzepte"])

        gesamt_xp, erreicht_xp = season_summen(k)
        g_gesamt_xp, g_erreicht_xp = grundlagen_summen(k)

        fortschritt["tagesziel"] = compute_tagesziel(fortschritt)
        fortschritt["gesamt_xp"] = gesamt_xp
        fortschritt["erreicht_xp"] = erreicht_xp
        fortschritt["grundlagen_gesamt_xp"] = g_gesamt_xp
        fortschritt["grundlagen_erreicht_xp"] = g_erreicht_xp
        self._json_response({"aktuell_md": aktuell_md, "fortschritt": fortschritt})

    def _handle_stats(self):
        fortschritt = json.loads(FORTSCHRITT_JSON.read_text(encoding="utf-8"))
        k = annotate_xp_anteil(fortschritt["konzepte"])

        gesamt_xp, erreicht_xp = season_summen(k)
        g_gesamt_xp, g_erreicht_xp = grundlagen_summen(k)

        fortschritt["tagesziel"] = compute_tagesziel(fortschritt)
        fortschritt["gesamt_xp"] = gesamt_xp
        fortschritt["erreicht_xp"] = erreicht_xp
        fortschritt["grundlagen_gesamt_xp"] = g_gesamt_xp
        fortschritt["grundlagen_erreicht_xp"] = g_erreicht_xp
        fortschritt["taeglich"] = compute_daily_xp(fortschritt.get("log", []))
        fortschritt["pace"] = compute_pace(fortschritt, gesamt_xp, erreicht_xp)
        fortschritt["fehlerlog_offen"] = count_fehlerlog_offen()

        woechentlich = compute_weekly_xp(fortschritt.get("log", []))
        fortschritt["woechentlich"] = woechentlich
        fortschritt["wochenvergleich"] = compute_wochenvergleich(woechentlich)
        fortschritt["kalibrierung_auswertung"] = compute_calibration(fortschritt.get("kalibrierung", []))
        fortschritt["trefferquote"] = recent_trefferquote(fortschritt.get("kalibrierung", []))
        fortschritt["badges"] = compute_badges(fortschritt, gesamt_xp, erreicht_xp)

        self._json_response(fortschritt)

    def _handle_history(self):
        self._json_response({"messages": load_chat_history()})

    def _handle_archiv_list(self):
        self._json_response(list_archiv())

    def _handle_archiv_datei(self, qs):
        name = (qs.get("name") or [""])[0]
        if not name or "/" in name or "\\" in name or ".." in name or not name.endswith(".md"):
            self.send_error(400, "ungueltiger Dateiname")
            return
        path = ERLEDIGT_DIR / name
        if not path.is_file():
            self.send_error(404)
            return
        self._json_response({"content": path.read_text(encoding="utf-8")})

    # ---------- Chat ----------

    def do_POST(self):
        if self.path == "/api/send":
            self._handle_send()
        elif self.path == "/api/new-session":
            self._handle_new_session()
        elif self.path == "/api/archiv-frage":
            self._handle_archiv_frage()
        else:
            self.send_error(404)

    def _handle_new_session(self):
        """Loescht die hinterlegte Claude-Session-ID: der naechste Chat-Aufruf
        laeuft ohne --resume, also ohne die bisherige (mit jeder Nachricht
        weiter wachsende) Historie. Grund: `claude -p --resume` verarbeitet bei
        JEDER Nachricht die komplette bisherige Sitzung neu -- ueber viele
        Nachrichten (inkl. Thinking-Bloecke, Datei-Inhalte aus Read-Aufrufen)
        summiert sich das spuerbar auf und macht Antworten immer langsamer,
        unabhaengig vom Modell. Der Chat-Verlauf in der Oberflaeche bleibt
        unangetastet, nur die Claude-interne Sitzung startet frisch."""
        if _send_lock.locked():
            self._json_response({"ok": False, "error": "Es laeuft gerade eine Anfrage -- bitte kurz warten."})
            return
        save_session_id(None)
        self._json_response({"ok": True})

    def _write_ndjson(self, obj):
        line = (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")
        try:
            self.wfile.write(line)
            self.wfile.flush()
        except (BrokenPipeError, ConnectionAbortedError):
            pass

    def _run_claude(self, message, session_id):
        """Chat-Aufruf mit Sitzungsfortsetzung -- speichert die zurueckgegebene
        session_id, damit /api/send beim naechsten Mal --resume nutzen kann."""
        return self._run_claude_cmd(build_claude_cmd(message, session_id), save_session=True)

    def _run_claude_oneoff(self, prompt):
        """Zustandsloser Einzelaufruf (z.B. Archiv-Rueckfrage) -- keine
        session_id wird gespeichert oder erwartet, jeder Aufruf startet frisch."""
        return self._run_claude_cmd(build_archiv_frage_cmd(prompt), save_session=False)

    def _run_claude_cmd(self, cmd, save_session):
        """Startet claude -p, leitet Text-Deltas, Werkzeug-Status-Ereignisse und
        das Endergebnis live an den Client weiter. Gibt
        (returncode, stderr_text, got_result, voller_antworttext, timed_out) zurueck.

        Ohne Zeitlimit wuerde ein haengender Prozess (Netzwerkaussetzer,
        nie beantwortete Rueckfrage) den Chat fuer immer im "tippt..."-Zustand
        einfrieren -- ohne jede Fehlermeldung, ohne Moeglichkeit sich selbst
        zu erholen. Der Timer killt den Prozess nach CLAUDE_TIMEOUT_SECONDS,
        der bestehende Fehlerpfad in _handle_send zeigt das dann normal an."""
        proc = subprocess.Popen(
            cmd,
            cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", errors="replace", bufsize=1,
        )
        timed_out = threading.Event()

        def _kill_on_timeout():
            timed_out.set()
            proc.kill()

        timer = threading.Timer(CLAUDE_TIMEOUT_SECONDS, _kill_on_timeout)
        timer.start()

        got_result = False
        full_text = []
        try:
            for line in proc.stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    evt = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if evt.get("type") == "stream_event":
                    event = evt.get("event", {})
                    etype = event.get("type")
                    if etype == "content_block_delta":
                        delta = event.get("delta", {})
                        if delta.get("type") == "text_delta":
                            text = delta.get("text", "")
                            full_text.append(text)
                            self._write_ndjson({"type": "delta", "text": text})
                    elif etype == "content_block_start":
                        cb = event.get("content_block", {})
                        if cb.get("type") == "tool_use":
                            self._write_ndjson({"type": "tool", "name": cb.get("name", "?")})

                elif evt.get("type") == "result":
                    got_result = True
                    sid = evt.get("session_id")
                    if sid and save_session:
                        save_session_id(sid)
                    if evt.get("is_error"):
                        self._write_ndjson({"type": "error", "message": str(evt.get("result") or "unbekannter Fehler")})
                    self._write_ndjson({
                        "type": "final",
                        "session_id": sid,
                        "cost_usd": evt.get("total_cost_usd"),
                    })
        finally:
            timer.cancel()

        proc.stdout.close()
        stderr_text = proc.stderr.read()
        proc.wait()
        if timed_out.is_set():
            stderr_text = f"Zeitlimit ({CLAUDE_TIMEOUT_SECONDS}s) ueberschritten, Prozess abgebrochen.\n" + stderr_text
        return proc.returncode, stderr_text, got_result, "".join(full_text), timed_out.is_set()

    def _handle_send(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw.decode("utf-8", errors="replace")) if raw else {}
        except json.JSONDecodeError:
            body = {}
        message = (body.get("message") or "").strip()
        if not message:
            self.send_error(400, "leere Nachricht")
            return

        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

        # Ohne diese Sperre koennten zwei gleichzeitige Anfragen (zweiter Tab,
        # Doppelklick trotz deaktiviertem Button) zwei parallele
        # "claude -p --resume <gleiche id>"-Prozesse starten und sich die
        # Session gegenseitig kaputtschreiben. Zweite Anfrage bekommt sofort
        # eine klare Fehlermeldung statt eines stillen Datenwirrwarrs.
        if not _send_lock.acquire(blocking=False):
            self._write_ndjson({"type": "error", "message": "Es laeuft schon eine Anfrage -- bitte kurz warten, bis die Antwort da ist."})
            return

        try:
            append_chat_history("user", message)
            before_grades = read_grades()

            session_id = load_session_id()
            full_text = ""
            try:
                code, stderr_text, got_result, full_text, timed_out = self._run_claude(message, session_id)
            except FileNotFoundError:
                self._write_ndjson({"type": "error", "message": f"claude.exe nicht gefunden unter: {CLAUDE_EXE}"})
                return

            # Fallstrick: eine ungueltige/abgelaufene --resume-Session-ID laesst
            # claude -p mit Fehler abbrechen. Einmaliger Neuversuch ohne --resume
            # (frische Sitzung), damit der Chat nicht einfach haengen bleibt.
            # Nicht bei timed_out: ein haengender Prozess braucht keinen zweiten
            # Versuch, der dann noch einmal so lange haengen koennte.
            if code != 0 and session_id and not got_result and not timed_out:
                save_session_id(None)
                try:
                    code, stderr_text, got_result, full_text, timed_out = self._run_claude(message, None)
                except FileNotFoundError:
                    pass

            if code != 0 and not got_result:
                self._write_ndjson({"type": "error", "message": f"claude beendete mit Code {code}: {stderr_text.strip()[:500]}"})
            self._finish_send(before_grades, full_text)
        finally:
            _send_lock.release()

    def _finish_send(self, before_grades, full_text):
        if full_text.strip():
            append_chat_history("assistant", full_text)

        try:
            after_data = json.loads(FORTSCHRITT_JSON.read_text(encoding="utf-8"))
            level_ups = diff_level_ups(before_grades, after_data)
            if level_ups:
                self._write_ndjson({"type": "levelup", "konzepte": level_ups})
        except (json.JSONDecodeError, OSError):
            pass

    def _handle_archiv_frage(self):
        """Kurze Rueckfrage zu einer bereits archivierten Aufgabe -- bewusst
        unabhaengig vom Haupt-Chat: eigene, zustandslose claude-Aufrufe (siehe
        build_archiv_frage_cmd), stellt keine neue Aufgabe, schreibt nichts in
        aufgaben/aktuell.md oder den Chat-Verlauf."""
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw.decode("utf-8", errors="replace")) if raw else {}
        except json.JSONDecodeError:
            body = {}
        name = (body.get("name") or "").strip()
        frage = (body.get("frage") or "").strip()

        if not name or "/" in name or "\\" in name or ".." in name or not name.endswith(".md"):
            self.send_error(400, "ungueltiger Dateiname")
            return
        if not frage:
            self.send_error(400, "leere Frage")
            return
        path = ERLEDIGT_DIR / name
        if not path.is_file():
            self.send_error(404)
            return
        inhalt = path.read_text(encoding="utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True

        if not _archiv_frage_lock.acquire(blocking=False):
            self._write_ndjson({"type": "error", "message": "Es laeuft schon eine Rückfrage — bitte kurz warten."})
            return

        try:
            prompt = build_archiv_frage_prompt(name, inhalt, frage)
            try:
                code, stderr_text, got_result, full_text, timed_out = self._run_claude_oneoff(prompt)
            except FileNotFoundError:
                self._write_ndjson({"type": "error", "message": f"claude.exe nicht gefunden unter: {CLAUDE_EXE}"})
                return
            if code != 0 and not got_result:
                self._write_ndjson({"type": "error", "message": f"claude beendete mit Code {code}: {stderr_text.strip()[:500]}"})
        finally:
            _archiv_frage_lock.release()


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}"
    print(f"NLFEM Lern-App laeuft: {url}  (Strg+C zum Beenden)")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBeendet.")


if __name__ == "__main__":
    main()
