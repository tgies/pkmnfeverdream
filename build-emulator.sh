#!/bin/bash
# Build binjgb WASM with RGBDS_LIVE support for breakpoints
# Build flags match .github/workflows/build.yml but add RGBDS_LIVE
# Also add EXPORTED_RUNTIME_METHODS for HEAPU8/HEAPU32 (newer Emscripten doesn't export these by default)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/vendor/binjgb"

echo "Building binjgb with Emscripten (RGBDS_LIVE=ON for breakpoint support)..."

# Use Docker for Emscripten build - match the official build.yml but add RGBDS_LIVE
docker run --rm \
  -v "$(pwd):/src" \
  -w /src \
  emscripten/emsdk:latest \
  bash -c "
    apt-get update && apt-get install -y ninja-build && \
    mkdir -p out/Wasm && cd out/Wasm && \
    emcmake cmake ../.. -G Ninja -DCMAKE_BUILD_TYPE=Release -DWASM=ON -DRGBDS_LIVE=ON -DCMAKE_EXE_LINKER_FLAGS=\"-sEXPORTED_RUNTIME_METHODS=['HEAPU8','HEAPU32']\" && \
    emmake ninja
  "

echo "Done! Artifacts in vendor/binjgb/out/Wasm/"



