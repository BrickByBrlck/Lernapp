"""PDF-Material-Import fuer den Setup-Tutor-Wizard.

Extrahiert Text aus einem Ordner mit Vorlesungsfolien/Skripten (PDF) nach
`material/text/`, im Format, das `CLAUDE.md` als bevorzugte Materialquelle
erwartet ("material/text/* -- vorextrahierter Text"). Damit muss der Nutzer
nicht selbst Text aus PDFs kopieren, bevor `/setup-tutor` (siehe
`.claude/skills/setup-tutor/SKILL.md`) den Kurs einrichtet.

Einzige Abhaengigkeit dieses Skripts ist `pypdf` (pip install pypdf) --
app.py selbst bleibt bewusst stdlib-only, das gilt nur fuer dieses optionale
Ingest-Werkzeug.

Nutzung:
    python material_import.py <ordner-mit-pdfs> [--out material/text] [--force]

Unterordner im Quellordner werden gespiegelt (z.B. "Woche3/folie02.pdf" ->
"material/text/Woche3/folie02.txt"), damit die Struktur der Vorlesung
erhalten bleibt.
"""

import argparse
import sys
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    print("Fehlt: pypdf. Installieren mit: pip install pypdf", file=sys.stderr)
    sys.exit(1)


def extract_pdf_text(pdf_path):
    """Text pro Seite, mit Seitenmarkern -- hilft dem Tutor spaeter, sich auf
    eine konkrete Folie zu beziehen ('siehe Seite 4')."""
    reader = PdfReader(pdf_path)
    seiten = []
    for i, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if text:
            seiten.append(f"--- Seite {i} ---\n{text}")
        else:
            seiten.append(f"--- Seite {i} (kein Text erkannt) ---")
    return "\n\n".join(seiten)


def import_folder(quellordner, zielordner, force=False):
    pdfs = sorted(quellordner.rglob("*.pdf"))
    if not pdfs:
        print(f"Keine PDFs gefunden in {quellordner}")
        return 0, [], 0

    zielordner.mkdir(parents=True, exist_ok=True)
    ok, failed, skipped = 0, [], 0

    for pdf in pdfs:
        ziel = (zielordner / pdf.relative_to(quellordner)).with_suffix(".txt")
        if ziel.exists() and not force:
            skipped += 1
            continue
        try:
            text = extract_pdf_text(pdf)
        except Exception as e:
            failed.append((pdf, str(e)))
            continue
        if not text.strip():
            failed.append((pdf, "kein Text extrahiert (evtl. gescanntes PDF ohne OCR)"))
            continue
        ziel.parent.mkdir(parents=True, exist_ok=True)
        ziel.write_text(text, encoding="utf-8")
        ok += 1
        print(f"OK     {pdf.relative_to(quellordner)} -> {ziel}")

    return ok, failed, skipped


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("ordner", type=Path, help="Ordner mit PDF-Dateien (rekursiv durchsucht)")
    parser.add_argument("--out", type=Path, default=Path("material/text"),
                         help="Zielordner fuer den extrahierten Text (Default: material/text)")
    parser.add_argument("--force", action="store_true",
                         help="Bereits extrahierte .txt-Dateien ueberschreiben")
    args = parser.parse_args()

    if not args.ordner.is_dir():
        print(f"Ordner nicht gefunden: {args.ordner}", file=sys.stderr)
        sys.exit(1)

    ok, failed, skipped = import_folder(args.ordner, args.out, force=args.force)

    if skipped:
        print(f"Uebersprungen (bereits vorhanden, --force zum Ueberschreiben): {skipped}")
    for pdf, err in failed:
        print(f"FEHLER {pdf.name}: {err}", file=sys.stderr)

    total = ok + len(failed) + skipped
    print(f"\n{ok} von {total} PDFs extrahiert nach {args.out}/")
    if failed:
        print(f"{len(failed)} fehlgeschlagen -- oft gescannte PDFs ohne echten Text "
              f"(brauchen OCR, das macht dieses Skript nicht).")


if __name__ == "__main__":
    main()
