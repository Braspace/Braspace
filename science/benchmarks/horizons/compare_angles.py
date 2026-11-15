#!/usr/bin/env python3
"""Compara um arquivo de angulos calculados contra o benchmark JPL Horizons e imprime o residuo.

Uso:
  python3 compare_angles.py --benchmark science/benchmarks/horizons/benchmark.json \
      --calculated calculado_angulos.json [--tolerancia-deg 0.05]

O arquivo calculado deve conter uma chave "entries" (lista), e cada entrada deve ter
site, epoch_utc, body, azimuth_deg e elevation_deg. A comparacao faz join por
(site, epoch_utc, body) e imprime o residuo = calculado - benchmark para azimute e
eleventao, em graus, mais um resumo estatistico.

Saida: tabela linha a linha + resumo (contagem comparada, maximo absoluto, medio,
desvio padrao para az e el). Retorna codigo de saída != 0 se algum resíduo absoluto
exceder --tolerancia-deg ou se houver entradas calculadas sem correspondencia no benchmark.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path


def load_entries(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, dict):
        entries = data.get("entries", data.get("samples", []))
    elif isinstance(data, list):
        entries = data
    else:
        raise ValueError("formato de arquivo calculado nao reconhecido: %s" % path)
    return entries


def build_index(entries):
    idx = {}
    for e in entries:
        key = (str(e["site"]), str(e["epoch_utc"]), int(e["body"]))
        idx[key] = e
    return idx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--benchmark", required=True, help="caminho do benchmark.json")
    parser.add_argument("--calculated", required=True, help="caminho do arquivo de angulos calculados")
    parser.add_argument("--tolerancia-deg", type=float, default=0.05,
                        help="tolerancia absoluta de resíduo em graus (padrao 0.05)")
    args = parser.parse_args()

    bench_entries = load_entries(args.benchmark)
    calc_entries = load_entries(args.calculated)

    bench_index = build_index(bench_entries)

    compared = []
    missing = []
    for c in calc_entries:
        key = (str(c["site"]), str(c["epoch_utc"]), int(c["body"]))
        b = bench_index.get(key)
        if b is None:
            missing.append(c)
            continue
        res_az = float(c["azimuth_deg"]) - float(b["azimuth_deg"])
        res_el = float(c["elevation_deg"]) - float(b["elevation_deg"])
        compared.append({
            "site": c["site"],
            "epoch_utc": c["epoch_utc"],
            "body": c["body"],
            "body_name": c.get("body_name", b.get("body_name", "")),
            "calc_az": float(c["azimuth_deg"]),
            "bench_az": float(b["azimuth_deg"]),
            "res_az": res_az,
            "calc_el": float(c["elevation_deg"]),
            "bench_el": float(b["elevation_deg"]),
            "res_el": res_el,
        })

    print("Comparador de angulos vs benchmark JPL Horizons")
    print("  benchmark : %s" % args.benchmark)
    print("  calculado : %s" % args.calculated)
    print("  entradas benchmark : %d" % len(bench_entries))
    print("  entradas calculadas: %d" % len(calc_entries))
    print("  comparadas         : %d" % len(compared))
    print("  sem correspondencia: %d" % len(missing))
    print()
    if missing:
        print("Entradas calculadas sem correspondencia no benchmark:")
        for c in missing:
            print("  site=%s epoch=%s body=%s az=%.4f el=%.4f" % (
                c["site"], c["epoch_utc"], c["body"],
                float(c["azimuth_deg"]), float(c["elevation_deg"])))
        print()

    print(f"{'site':<10} {'epoch_utc':<20} {'body':<6} {'calc_az':>9} {'bench_az':>9} {'res_az':>9} {'calc_el':>9} {'bench_el':>9} {'res_el':>9}")
    for r in compared:
        print(f"{r['site']:<10} {r['epoch_utc']:<20} {r['body']:<6} {r['calc_az']:>9.4f} {r['bench_az']:>9.4f} {r['res_az']:>9.4f} {r['calc_el']:>9.4f} {r['bench_el']:>9.4f} {r['res_el']:>9.4f}")

    if compared:
        abs_az = [abs(r["res_az"]) for r in compared]
        abs_el = [abs(r["res_el"]) for r in compared]
        mean_az = sum(r["res_az"] for r in compared) / len(compared)
        mean_el = sum(r["res_el"] for r in compared) / len(compared)
        max_az = max(abs_az)
        max_el = max(abs_el)
        def stdev(vals, mean):
            n = len(vals)
            if n < 2:
                return 0.0
            return math.sqrt(sum((v - mean) ** 2 for v in vals) / (n - 1))
        sd_az = stdev([r["res_az"] for r in compared], mean_az)
        sd_el = stdev([r["res_el"] for r in compared], mean_el)
        print()
        print("Resumo de resíduos (calculado - benchmark):")
        print("  azimuto : medio=%+.6f deg  max_abs=%.6f deg  dp=%.6f deg" % (mean_az, max_az, sd_az))
        print("  elevacao: medio=%+.6f deg  max_abs=%.6f deg  dp=%.6f deg" % (mean_el, max_el, sd_el))

    falha = bool(missing)
    if compared and (max_az > args.tolerancia_deg or max_el > args.tolerancia_deg):
        falha = True
    print()
    if falha:
        print("RESULTADO: FALHA (resíduos acima da tolerancia ou entradas sem correspondencia)")
        return 1
    print("RESULTADO: OK (todos os resíduos dentro da tolerancia de %.2f deg)" % args.tolerancia_deg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
