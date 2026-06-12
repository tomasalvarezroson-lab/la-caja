#!/usr/bin/env python3
"""
update_data.py — Convierte el export CSV de "Registro 2026" (Google Sheet del
ContaBot) al data.json que consume el dashboard (public/data.json).

Uso:
    python3 scripts/update_data.py ruta/al/export.csv

El CSV debe tener las 18 columnas del schema:
ID, Fecha, Hora, Mes, Tipo, Categoría, Subcat (orig), Concepto / Comercio,
Contraparte, Monto, Divisa, Medio de Pago, Cuota N, Cuota Tot,
Reintegrable, Asociado a, Estado, Descripción

Cómo exportar desde Google Sheets:
  Archivo → Descargar → Valores separados por comas (.csv)
  (asegurate de estar parado en la pestaña "Registro 2026")
"""
import csv
import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data.json"

MESES_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]


def parse_fecha(raw: str):
    """Parsea DD/MM/YYYY o YYYY-MM-DD. Devuelve (fecha_iso, año, mes_es)."""
    raw = (raw or "").strip()
    if not raw:
        return "", None, ""
    # Ya viene en ISO
    if len(raw) >= 10 and raw[4] == '-':
        try:
            dt = datetime.strptime(raw[:10], "%Y-%m-%d")
            return dt.strftime("%Y-%m-%d"), dt.year, MESES_ES[dt.month - 1]
        except ValueError:
            pass
    # Formato argentino DD/MM/YYYY
    try:
        dt = datetime.strptime(raw[:10], "%d/%m/%Y")
        return dt.strftime("%Y-%m-%d"), dt.year, MESES_ES[dt.month - 1]
    except ValueError:
        return raw, None, ""


def parse_monto(raw: str) -> float:
    """Parsea montos en formato argentino (punto=miles, coma=decimal)."""
    s = (raw or "").strip().replace("$", "").replace(" ", "")
    if not s:
        return 0.0
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    else:
        parts = s.split(".")
        if len(parts) > 1 and all(len(p) == 3 for p in parts[1:]):
            s = "".join(parts)
    try:
        return abs(float(s))
    except ValueError:
        return 0.0


def main(csv_path: str):
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8-sig")))
    out = []
    for r in rows:
        idv = (r.get("ID") or "").strip()
        if not idv:
            continue
        fecha_iso, año, mes = parse_fecha(r.get("Fecha", ""))
        out.append({
            "id": idv,
            "fecha": fecha_iso,
            "año": año,
            "mes": mes,
            "hora": (r.get("Hora") or "").strip(),
            "tipo": (r.get("Tipo") or "").strip() or "Egreso",
            "cat": (r.get("Categoría") or "Otros").strip(),
            "subcat": (r.get("Subcat (orig)") or "").strip(),
            "concepto": (r.get("Concepto / Comercio") or "").strip(),
            "contraparte": (r.get("Contraparte") or "").strip(),
            "monto": parse_monto(r.get("Monto", "0")),
            "divisa": (r.get("Divisa") or "ARS").strip(),
            "medio": (r.get("Medio de Pago") or "").strip(),
            "cuotaN": (r.get("Cuota N") or "").strip(),
            "cuotaT": (r.get("Cuota Tot") or "").strip(),
            "reint": (r.get("Reintegrable") or "No").strip(),
            "fuente": "bot",
            "ref_banco": "",
            "estado": (r.get("Estado") or "").strip(),
            "desc": (r.get("Descripción") or "").strip(),
        })

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {len(out)} movimientos -> {OUT}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python3 scripts/update_data.py ruta/al/export.csv")
        sys.exit(1)
    main(sys.argv[1])
