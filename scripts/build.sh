#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only

set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"

version=$(node -p 'require("./src/manifest.json").version')
package_name="route-sentinel-chromium-v${version}"
build_directory="dist/${package_name}"
archive_path="dist/${package_name}.zip"

case "$build_directory" in
  dist/route-sentinel-chromium-v*) ;;
  *)
    echo "Refusing to clean an unexpected build path." >&2
    exit 1
    ;;
esac

rm -rf -- "$build_directory"
rm -f -- "$archive_path"
mkdir -p -- "$build_directory"

for source_file in manifest.json filter.js content.js player-probe.js; do
  cp -- "src/${source_file}" "${build_directory}/${source_file}"
  chmod 0644 "${build_directory}/${source_file}"
  touch -t 198001010000 "${build_directory}/${source_file}"
done

node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' \
  "${build_directory}/manifest.json"

(
  cd "$build_directory"
  zip -X -q "../${package_name}.zip" \
    manifest.json filter.js content.js player-probe.js
)

echo "Built ${archive_path}"
