#!/bin/bash
# Build Pokemon Red ROM using Docker RGBDS
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/vendor/pokered"

echo "Building Pokemon Red ROM with Docker RGBDS..."

make -j$(nproc) RGBDS="docker run --rm -u $(id -u):$(id -g) \
  -v $(pwd):/work -w /work ghcr.io/gbdev/rgbds:v1.0.0 "

cp pokered.gbc "$SCRIPT_DIR/"

echo "Done! Output in pokered.gbc"
