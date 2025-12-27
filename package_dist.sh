#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist_tmp"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
ZIP_FILE="$SCRIPT_DIR/dist_${TIMESTAMP}.zip"

# Clean previous build artifacts and old zip packages
rm -rf "$DIST_DIR"
rm -f "$SCRIPT_DIR/dist_"*.zip
mkdir -p "$DIST_DIR"

echo "Creating distribution package..."

# Copy artifacts (assuming build scripts have run)
cp vendor/binjgb/docs/binjgb.{js,wasm} "$DIST_DIR/"
if [ -f "pokered.gbc" ]; then cp pokered.gbc "$DIST_DIR/"; else echo "Warning: pokered.gbc not found"; fi

# Copy required directories
cp -r battle emulator graphics mocks samples services "$DIST_DIR/"

# Copy required files
cp index.html index.tsx metadata.json package.json tsconfig.json vite.config.ts .gitignore "$DIST_DIR/"

# Zip the contents
cd "$DIST_DIR"
zip -r "$ZIP_FILE" .

echo "Package created at $ZIP_FILE"

# Clean up
cd "$SCRIPT_DIR"
rm -rf "$DIST_DIR"
