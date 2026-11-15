#!/usr/bin/env python3
"""Refaz o download do benchmark independente de angulos Sol/Terra do JPL Horizons.

Consulta https://ssd.jpl.nasa.gov/api/horizons.api (sem chave) para os alvos
Sol (10) e Terra (399), observador na superficie da Lua por coordenada
(CENTER='coord@301' com SITE_COORD='longitude,latitude,altitude'), quantidade
de azimute e elevacao aparentes (QUANTITIES=4). Respeita no maximo 1
requisicao por segundo.

Salva:
  science/benchmarks/horizons/raw/<site>/<epoch>/<body>.json  resposta bruta (JSON HTTP completo)
  science/benchmarks/horizons/benchmark.json                   normalizado
"""
from __future__ import annotations

import hashlib
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
FALLBACK_HORIZONS_VERSION = "1.2"
FALLBACK_EPHEMERIS_SOURCE = "DE441"
FALLBACK_FRAME = "MEAN_ME"

SITES = [
    {
        "site": "lm1",
        "name": "Shackleton Rim B",
        "latitude_deg": -89.5244,
        "longitude_deg": 56.30993,
        "altitude_km": 0.0,
        "provenance": "NASA Lunar Surface Data Book ACD-50044 Rev. A, Appendix A2 (feature center); planetocentric lat, east-positive lon; ~5-10 m feature-center accuracy.",
    },
    {
        "site": "haworth",
        "name": "Haworth",
        "latitude_deg": -86.7639,
        "longitude_deg": -22.77700,
        "altitude_km": 0.0,
        "provenance": "NASA Lunar Surface Data Book ACD-50044 Rev. A, Appendix A2 (feature center); planetocentric lat, east-positive lon; ~5-10 m feature-center accuracy.",
    },
    {
        "site": "shoemaker",
        "name": "Shoemaker",
        "latitude_deg": -87.1835,
        "longitude_deg": 62.83502,
        "altitude_km": 0.0,
        "provenance": "NASA Lunar Surface Data Book ACD-50044 Rev. A, Appendix A2 (feature center); planetocentric lat, east-positive lon; ~5-10 m feature-center accuracy.",
    },
]

EPOCHS = [
    "2026-12-01T12:00:00Z",
    "2026-12-09T12:00:00Z",
    "2026-12-17T12:00:00Z",
    "2026-12-25T12:00:00Z",
    "2027-01-02T12:00:00Z",
    "2027-01-10T12:00:00Z",
    "2027-01-18T12:00:00Z",
    "2027-01-26T12:00:00Z",
]

BODIES = [
    {"id": 10, "name": "Sun"},
    {"id": 399, "name": "Earth"},
]

REQ_TIMEOUT = 60
MIN_INTERVAL_S = 1.1


def horizon_query(params):
    url = BASE_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "braspac-helena-benchmark/1.0"})
    with urllib.request.urlopen(req, timeout=REQ_TIMEOUT) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_az_el(text):
    """Extrai azimute/elevacao do bloco $$SOE ... $$EOE do texto de resultado."""
    match = re.search(r"\$\$SOE\n(.*?)\n\$\$EOE", text, re.S)
    if not match:
        raise ValueError("bloco $$SOE/$$EOE nao encontrado no resultado Horizons")
    rows = [ln for ln in match.group(1).splitlines() if ln.strip()]
    if len(rows) != 1:
        raise ValueError("esperava uma linha de efemeride, obteve %d: %r" % (len(rows), rows))
    parts = rows[0].split()
    # linha tipo: " 2026-Dec-01 12:00 *   217.667102   1.090980"
    az = float(parts[-2])
    el = float(parts[-1])
    return az, el


def extract_source(text):
    m = re.search(r"\{source:\s*([A-Za-z0-9]+)\}", text)
    return m.group(1) if m else FALLBACK_EPHEMERIS_SOURCE


def epoch_file_tag(epoch_utc):
    return epoch_utc.replace(":", "").replace("-", "").replace("T", "")


def main():
    # script esta em science/benchmarks/horizons/; raiz do repo eh 4 niveis acima.
    root = Path(__file__).resolve().parent.parent.parent.parent
    horizons_dir = root / "science" / "benchmarks" / "horizons"
    raw_dir = horizons_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    entries = []
    last_call = 0.0
    for site in SITES:
        site_dir = raw_dir / site["site"]
        site_dir.mkdir(parents=True, exist_ok=True)
        site_coord = "%s,%s,%s" % (site["longitude_deg"], site["latitude_deg"], site["altitude_km"])
        for epoch in EPOCHS:
            epoch_dir = site_dir / epoch_file_tag(epoch)
            epoch_dir.mkdir(parents=True, exist_ok=True)
            for body in BODIES:
                now = time.time()
                delta = now - last_call
                if delta < MIN_INTERVAL_S:
                    time.sleep(MIN_INTERVAL_S - delta)
                last_call = time.time()
                stop = epoch.replace("T12:00:00Z", "T12:01:00Z")
                params = {
                    "format": "json",
                    "COMMAND": str(body["id"]),
                    "CENTER": "coord@301",
                    "SITE_COORD": site_coord,
                    "START_TIME": epoch,
                    "STOP_TIME": stop,
                    "STEP_SIZE": "1d",
                    "QUANTITIES": "4",
                }
                raw = horizon_query(params)
                # resposta bruta: corpo HTTP completo (JSON), gravado tal qual.
                body_file = epoch_dir / (str(body["id"]) + ".json")
                body_file.write_text(raw, encoding="utf-8")
                digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()

                data = json.loads(raw)
                text = data.get("result", "")
                version = (data.get("signature") or {}).get("version", FALLBACK_HORIZONS_VERSION)
                az, el = parse_az_el(text)
                entries.append({
                    "site": site["site"],
                    "site_name": site["name"],
                    "latitude_deg": site["latitude_deg"],
                    "longitude_deg": site["longitude_deg"],
                    "altitude_km": site["altitude_km"],
                    "epoch_utc": epoch,
                    "body": body["id"],
                    "body_name": body["name"],
                    "azimuth_deg": round(az, 6),
                    "elevation_deg": round(el, 6),
                    "frame": FALLBACK_FRAME,
                    "horizons_version": version,
                    "ephemeris_source": extract_source(text),
                    "raw_file": str(body_file.relative_to(root)),
                    "response_sha256": digest,
                })
                print("OK %s %s body=%s az=%.4f el=%.4f" % (site["site"], epoch, body["id"], az, el))

    benchmark = {
        "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "issue": "BS-017",
        "gate": "G5",
        "horizons_api": {
            "url": BASE_URL,
            "version": FALLBACK_HORIZONS_VERSION,
            "ephemeris_source": FALLBACK_EPHEMERIS_SOURCE,
            "frame": FALLBACK_FRAME,
        },
        "convention": {
            "azimuth": "medido no sentido horario a partir do norte local: North(0) -> East(90) -> South(180) -> West(270) -> North(360)",
            "elevation": "graus acima do plano perpendicular a direcao do zenito local da superficie de referencia (MEAN_ME), toposcentrica",
            "refraction": "NENHUMA (airless); a Lua nao tem atmosfera",
            "light_time": "compensada (atraso de luz da ida, desvio gravitacional da luz, aberracao estelar, precessao e nutacao)",
            "target": "centro do corpo celeste (nao a borda/lmbo superior)",
        },
        "limits": [
            "o Horizons usa a superficie de referencia (elipsoide/esfera Media da Lua), NAO o relevo topografico (LOLA)",
            "valida angulo do corpo celeste (Sol/Terra), NAO o horizonte do terreno nem visibilidade acima de crateras/encostas",
        ],
        "sites": SITES,
        "epochs": EPOCHS,
        "bodies": BODIES,
        "count": len(entries),
        "entries": entries,
    }
    (horizons_dir / "benchmark.json").write_text(
        json.dumps(benchmark, indent=2, allow_nan=False, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print("\nbenchmark.json gravado com %d entradas em %s" % (len(entries), horizons_dir / "benchmark.json"))


if __name__ == "__main__":
    main()
