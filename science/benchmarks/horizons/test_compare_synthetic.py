#!/usr/bin/env python3
"""Teste sintético do comparador de angulos (compare_angles.py).

Gera um arquivo calculado a partir do benchmark com desvios conhecidos:
- metade das entradas copiada exatamente (residuo 0)
- metade com desvio conhecido de +0.3 deg em az e -0.2 deg em el
Executa compare_angles.py e verifica que os resíduos impressos batem com os desvios injetados.
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

BENCH = Path("science/benchmarks/horizons/benchmark.json")
CALC = Path("/tmp/calc_synthetic.json")
OUT = Path("/tmp/compare_out.txt")


def main():
    bench = json.loads(BENCH.read_text(encoding="utf-8"))
    entries = []
    n = 0
    for e in bench["entries"]:
        n += 1
        c = {
            "site": e["site"],
            "epoch_utc": e["epoch_utc"],
            "body": e["body"],
            "body_name": e["body_name"],
            "azimuth_deg": round(e["azimuth_deg"], 6),
            "elevation_deg": round(e["elevation_deg"], 6),
        }
        if n % 2 == 0:  # injeta desvio conhecido
            c["azimuth_deg"] = round(c["azimuth_deg"] + 0.3, 6)
            c["elevation_deg"] = round(c["elevation_deg"] - 0.2, 6)
        entries.append(c)
    calc = {"entries": entries}
    CALC.write_text(json.dumps(calc, indent=2) + "\n", encoding="utf-8")

    res = subprocess.run(
        [sys.executable, "science/benchmarks/horizons/compare_angles.py",
         "--benchmark", str(BENCH), "--calculated", str(CALC),
         "--tolerancia-deg", "0.05"],
        capture_output=True, text=True,
    )
    OUT.write_text(res.stdout + res.stderr, encoding="utf-8")
    print(res.stdout)
    if res.returncode != 0:
        print("SAIDA DE ERRO:\n", res.stderr)

    # Verificacoes
    txt = res.stdout
    # Encontra uma linha injetada (n par) e confere residuo aproximado de +0.3 az / -0.2 el
    import re
    # primeira entrada injetada e n=2 (lm1, 2026-12-01T12:00:00Z, body 399)
    m = re.search(
        r"lm1\s+2026-12-01T12:00:00Z\s+399\s+-?[\d.]+\s+-?[\d.]+\s+([\d.+-]+)\s+-?[\d.]+\s+-?[\d.]+\s+([\d.+-]+)",
        txt,
    )
    ok = True
    if m:
        res_az = float(m.group(1))
        res_el = float(m.group(2))
        print(f"residuo injetado (n=2): az={res_az:+.4f} el={res_el:+.4f} (esperado az=+0.3 el=-0.2)")
        if abs(res_az - 0.3) > 0.001 or abs(res_el - (-0.2)) > 0.001:
            ok = False
    else:
        print("AVISO: linha injetada n=2 nao encontrada na saída")
        ok = False

    # Resultado deve ser FALHA (desvios 0.3/0.2 excedem tolerancia 0.05)
    if "RESULTADO: FALHA" not in txt:
        print("AVISO: esperado RESULTADO: FALHA por exceder tolerancia")
        ok = False
    else:
        print("resultado: FALHA conforme esperado (desvios injetados excedem tolerancia 0.05)")

    # Teste 2: calculado idêntico ao benchmark -> residuo zero, RESULTADO: OK
    identical = {"entries": bench["entries"]}
    calc_id = Path("/tmp/calc_identical.json")
    calc_id.write_text(json.dumps(identical, indent=2) + "\n", encoding="utf-8")
    res2 = subprocess.run(
        [sys.executable, "science/benchmarks/horizons/compare_angles.py",
         "--benchmark", str(BENCH), "--calculated", str(calc_id),
         "--tolerancia-deg", "0.05"],
        capture_output=True, text=True,
    )
    txt2 = res2.stdout
    print("\n--- teste identico ---")
    print("OK identico" if ("RESULTADO: OK" in txt2 and res2.returncode == 0) else "FALHA identico")
    if not ("RESULTADO: OK" in txt2 and res2.returncode == 0):
        ok = False
        print(txt2)

    print("\nTESTE SINTETICO:", "PASSOU" if ok else "FALHOU")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
