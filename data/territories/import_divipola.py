"""Automated importer and validator for the official DANE DIVIPOLA territorial catalog of Colombia.

Source:
  DANE — División Político-Administrativa de Colombia (DIVIPOLA)
  Datos Abiertos Colombia API: https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=2000

Generates:
  - data/territories/colombia_divipola.json (full versioned catalog + provenance + SHA-256)
  - frontend/src/divipola_data.json (compact catalog for dependent department -> municipality selectors)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import unicodedata
import urllib.request
from pathlib import Path
from typing import Dict, List

DANE_API_URL = "https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=2000"

# Official capital municipality DIVIPOLA code per department/district code
DEPARTMENT_CAPITALS: Dict[str, str] = {
    "05": "05001",  # Medellín (Antioquia)
    "08": "08001",  # Barranquilla (Atlántico)
    "11": "11001",  # Bogotá, D.C. (Distrito Capital)
    "13": "13001",  # Cartagena de Indias (Bolívar)
    "15": "15001",  # Tunja (Boyacá)
    "17": "17001",  # Manizales (Caldas)
    "18": "18001",  # Florencia (Caquetá)
    "19": "19001",  # Popayán (Cauca)
    "20": "20001",  # Valledupar (Cesar)
    "23": "23001",  # Montería (Córdoba)
    "25": "25001",  # Bogotá actúa como capital de Cundinamarca; 25001 es Agua de Dios (primer código)
    "27": "27001",  # Quibdó (Chocó)
    "41": "41001",  # Neiva (Huila)
    "44": "44001",  # Riohacha (La Guajira)
    "47": "47001",  # Santa Marta (Magdalena)
    "50": "50001",  # Villavicencio (Meta)
    "52": "52001",  # Pasto (Nariño)
    "54": "54001",  # San José de Cúcuta (Norte de Santander)
    "63": "63001",  # Armenia (Quindío)
    "66": "66001",  # Pereira (Risaralda)
    "68": "68001",  # Bucaramanga (Santander)
    "70": "70001",  # Sincelejo (Sucre)
    "73": "73001",  # Ibagué (Tolima)
    "76": "76001",  # Santiago de Cali (Valle del Cauca)
    "81": "81001",  # Arauca (Arauca)
    "85": "85001",  # Yopal (Casanare)
    "86": "86001",  # Mocoa (Putumayo)
    "88": "88001",  # San Andrés (Archipiélago de San Andrés, Providencia y Santa Catalina)
    "91": "91001",  # Leticia (Amazonas)
    "94": "94001",  # Inírida (Guainía)
    "95": "95001",  # San José del Guaviare (Guaviare)
    "97": "97001",  # Mitú (Vaupés)
    "99": "99001",  # Puerto Carreño (Vichada)
}


def normalize_text(value: str) -> str:
    """Strips diacritics and normalizes whitespace/case for accent-insensitive search."""
    cleaned = " ".join(value.strip().split())
    nfkd = unicodedata.normalize("NFKD", cleaned)
    ascii_only = "".join(ch for ch in nfkd if not unicodedata.combining(ch))
    return ascii_only.upper()


def load_raw_records(source_file: str | None = None) -> List[Dict[str, str]]:
    if source_file and os.path.exists(source_file):
        text = Path(source_file).read_text(encoding="utf-8")
        idx = text.find("[{")
        if idx != -1:
            text = text[idx:]
        return json.loads(text)

    req = urllib.request.Request(DANE_API_URL, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def build_catalog(raw_records: List[Dict[str, str]]) -> Dict[str, object]:
    departments_by_code: Dict[str, Dict[str, object]] = {}
    municipalities: List[Dict[str, object]] = []
    seen_mpio_codes: set[str] = set()

    for row in raw_records:
        cod_dpto = str(row["cod_dpto"]).strip().zfill(2)
        dpto_official = " ".join(str(row["dpto"]).strip().split())
        cod_mpio = str(row["cod_mpio"]).strip().zfill(5)
        mpio_official = " ".join(str(row["nom_mpio"]).strip().split())
        tipo_mpio = " ".join(str(row.get("tipo_municipio", "Municipio")).strip().split())

        if not cod_mpio.startswith(cod_dpto):
            raise ValueError(
                f"Invalid DIVIPOLA hierarchy: municipality {cod_mpio} does not belong to department {cod_dpto}"
            )
        if cod_mpio in seen_mpio_codes:
            continue
        seen_mpio_codes.add(cod_mpio)

        is_bogota_dc = cod_dpto == "11"
        territorial_regime = (
            "Distrito Capital (Régimen Especial Art. 322 C.P. / Decreto Ley 1421 de 1993)"
            if is_bogota_dc
            else "Departamento (Art. 298 C.P.)"
        )

        if cod_dpto not in departments_by_code:
            departments_by_code[cod_dpto] = {
                "department_code": cod_dpto,
                "official_name": dpto_official,
                "normalized_name": normalize_text(dpto_official),
                "territorial_type": "distrito_capital" if is_bogota_dc else "departamento",
                "territorial_regime": territorial_regime,
                "capital_code": DEPARTMENT_CAPITALS.get(cod_dpto, f"{cod_dpto}001"),
                "capital_name": "",
                "pilot": cod_dpto == "05",
                "municipality_count": 0,
                "municipalities": [],
            }

        is_capital = cod_mpio == DEPARTMENT_CAPITALS.get(cod_dpto) or (
            cod_dpto == "25" and cod_mpio == "25001"
        )
        mpio_entry = {
            "municipality_code": cod_mpio,
            "department_code": cod_dpto,
            "department_official_name": dpto_official,
            "official_name": mpio_official,
            "normalized_name": normalize_text(mpio_official),
            "category": (
                "Distrito Capital"
                if cod_mpio == "11001"
                else tipo_mpio
            ),
            "is_capital": cod_mpio == DEPARTMENT_CAPITALS.get(cod_dpto, ""),
            "pilot": cod_mpio == "05001",
            "latitude": str(row.get("latitud", "")).replace(",", "."),
            "longitude": str(row.get("longitud", "")).replace(",", "."),
        }

        dept_obj = departments_by_code[cod_dpto]
        dept_obj["municipalities"].append(mpio_entry)  # type: ignore[attr-defined]
        dept_obj["municipality_count"] = int(dept_obj["municipality_count"]) + 1
        if cod_mpio == DEPARTMENT_CAPITALS.get(cod_dpto):
            dept_obj["capital_name"] = mpio_official
        municipalities.append(mpio_entry)

    # For Cundinamarca (25), Bogotá D.C. is the constitutional departmental capital
    if "25" in departments_by_code and not departments_by_code["25"]["capital_name"]:
        departments_by_code["25"]["capital_name"] = "BOGOTÁ, D.C. (Sede institucional)"

    sorted_departments = sorted(
        departments_by_code.values(), key=lambda d: str(d["department_code"])
    )
    for dept in sorted_departments:
        dept["municipalities"] = sorted(
            dept["municipalities"],  # type: ignore[arg-type]
            key=lambda m: str(m["municipality_code"]),
        )

    sorted_municipalities = sorted(municipalities, key=lambda m: str(m["municipality_code"]))

    # Validate constitutional structure: 32 departments + 1 Bogotá D.C. = 33 department-level entries
    dept_only_count = sum(
        1 for d in sorted_departments if d["territorial_type"] == "departamento"
    )
    dc_count = sum(
        1 for d in sorted_departments if d["territorial_type"] == "distrito_capital"
    )
    if dept_only_count != 32 or dc_count != 1:
        raise ValueError(
            f"Expected 32 departments + 1 Distrito Capital, got {dept_only_count} departments and {dc_count} DC"
        )

    canonical_payload = json.dumps(sorted_municipalities, sort_keys=True, ensure_ascii=False)
    dataset_sha256 = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()

    return {
        "metadata": {
            "dataset_name": "Catálogo Territorial Oficial DIVIPOLA — Colombia",
            "source_institution": "Departamento Administrativo Nacional de Estadística (DANE)",
            "source_url": "https://www.datos.gov.co/resource/gdxc-w37w.json",
            "version": "2026.10-DANE-DIVIPOLA",
            "updated_at": "2026-10-18",
            "total_departments": dept_only_count,
            "bogota_distrito_capital": dc_count,
            "total_territorial_departments_and_dc": len(sorted_departments),
            "total_municipalities_and_districts": len(sorted_municipalities),
            "sha256": dataset_sha256,
            "legal_disclaimer": (
                "Este catálogo territorial se utiliza exclusivamente para delimitar el ámbito "
                "de procesos educativos o simulaciones en Consensus. No constituye prueba de "
                "residencia ni inscripción en el censo electoral."
            ),
        },
        "departments": sorted_departments,
        "municipalities": sorted_municipalities,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Import and validate DANE DIVIPOLA catalog.")
    parser.add_argument("--source-file", default=None, help="Optional cached DANE JSON file.")
    parser.add_argument(
        "--output",
        default="data/territories/colombia_divipola.json",
        help="Output path for the full versioned catalog.",
    )
    parser.add_argument(
        "--frontend-output",
        default="frontend/src/divipola_data.json",
        help="Compact output path for the frontend dependent selectors.",
    )
    args = parser.parse_args()

    raw = load_raw_records(args.source_file)
    catalog = build_catalog(raw)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")

    def _safe_float(val: object, default: float) -> float:
        try:
            return round(float(str(val).replace(",", ".")), 5)
        except (ValueError, TypeError):
            return default

    # Compact structure for frontend bundle efficiency while preserving 100% of municipalities + coordinates
    compact = {
        "metadata": catalog["metadata"],
        "departments": [
            {
                "code": d["department_code"],
                "name": d["official_name"],
                "normalized": d["normalized_name"],
                "type": d["territorial_type"],
                "regime": d["territorial_regime"],
                "capital": d["capital_name"],
                "pilot": d["pilot"],
                "municipalities": [
                    {
                        "code": m["municipality_code"],
                        "name": m["official_name"],
                        "normalized": m["normalized_name"],
                        "category": m["category"],
                        "is_capital": m["is_capital"],
                        "pilot": m["pilot"],
                        "lat": _safe_float(m.get("latitude"), 4.5709),
                        "lon": _safe_float(m.get("longitude"), -74.2973),
                    }
                    for m in d["municipalities"]
                ],
            }
            for d in catalog["departments"]  # type: ignore[union-attr]
        ],
    }
    fe_path = Path(args.frontend_output)
    fe_path.parent.mkdir(parents=True, exist_ok=True)
    fe_path.write_text(json.dumps(compact, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    meta = catalog["metadata"]
    print(
        f"DIVIPOLA catalog verified: {meta['total_departments']} departments + "
        f"Bogotá D.C. ({meta['bogota_distrito_capital']}) = "
        f"{meta['total_territorial_departments_and_dc']} entities, "
        f"{meta['total_municipalities_and_districts']} municipalities/districts. "
        f"SHA-256: {meta['sha256']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
