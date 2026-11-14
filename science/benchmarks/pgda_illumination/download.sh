#!/usr/bin/env bash
# Reproducible download of the PGDA product 69 file used by this benchmark and of
# the LOLA DEM our horizon uses. Data stays OUTSIDE git (pass a directory).
# Usage: download.sh <data_dir>
set -euo pipefail
DIR=${1:?data dir}; mkdir -p "$DIR"; cd "$DIR"
MAX_BYTES=$((500*1024*1024))   # hard cap per file
get() { # url
  local url=$1 f; f=$(basename "$url")
  local len; len=$(curl -sIL "$url" | tr -d '\r' | awk 'tolower($1)=="content-length:"{v=$2} END{print v}')
  [[ -n "$len" && "$len" -le $MAX_BYTES ]] || { echo "refusing $f: size '$len' > cap" >&2; exit 2; }
  for i in $(seq 1 20); do
    [[ -f "$f" && $(stat -c %s "$f") == "$len" ]] && break
    curl -sSL --retry 3 -C - -o "$f" "$url" || sleep 3
  done
  [[ $(stat -c %s "$f") == "$len" ]] || { echo "incomplete $f" >&2; exit 3; }
}
ILL=http://imbrium.mit.edu/EXTRAS/ILLUMINATION
get $ILL/IMG/AVGVISIB_85S_060M_201608.IMG
get $ILL/IMG/AVGVISIB_85S_060M_201608.LBL
get $ILL/README_ILLUMINATION_2016.TXT
LDEM=https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img
get $LDEM/ldem_80s_80m.img
get $LDEM/ldem_80s_80m.lbl
[[ -f LDEM_80S_80M.IMG ]] || ln -s ldem_80s_80m.img LDEM_80S_80M.IMG
sha256sum AVGVISIB_85S_060M_201608.IMG AVGVISIB_85S_060M_201608.LBL README_ILLUMINATION_2016.TXT ldem_80s_80m.img ldem_80s_80m.lbl | tee SHA256SUMS
