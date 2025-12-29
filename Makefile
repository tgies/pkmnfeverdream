
# Makefile for Poke-AI Fever Dream

.PHONY: all rom emulator dist clean

TIMESTAMP := $(shell date +%Y%m%d_%H%M%S)
DIST_DIR := dist_tmp
ZIP_FILE := dist_$(TIMESTAMP).zip
SCRIPT_DIR := $(shell pwd)

all: dist

rom: pokered.gbc

# Build binjgb WASM with RGBDS_LIVE for breakpoint support
# Build flags match vendor/binjgb/.github/workflows/build.yml but add RGBDS_LIVE
# Also add EXPORTED_RUNTIME_METHODS for HEAPU8/HEAPU32 (newer Emscripten doesn't export these by default)
emulator:
	@echo "Building binjgb with Emscripten (RGBDS_LIVE=ON for breakpoint support)..."
	cd vendor/binjgb && \
	docker run --rm \
		-v "$$(pwd):/src" \
		-w /src \
		emscripten/emsdk:latest \
		bash -c "apt-get update && apt-get install -y ninja-build && mkdir -p out/Wasm && cd out/Wasm && emcmake cmake ../.. -G Ninja -DCMAKE_BUILD_TYPE=Release -DWASM=ON -DRGBDS_LIVE=ON -DCMAKE_EXE_LINKER_FLAGS=\"-sEXPORTED_RUNTIME_METHODS=['HEAPU8','HEAPU32']\" && emmake ninja"
	# Inject emulator stub into binjgb.js for RGBDS_LIVE serial callback support
	# The generated code has: var Binjgb=(()=>{var _scriptName=...
	# We inject: var emulator={serialCallback:function(){}}; right after the opening brace
	sed -i 's/=(()=>{var _scriptName/=(()=>{var emulator={serialCallback:function(){}};var _scriptName/' vendor/binjgb/out/Wasm/binjgb.js
	@echo "Done! Emulator built with breakpoint support in vendor/binjgb/out/Wasm/"

# This target only rebuilds if pokered.gbc is missing or vendor/pokered/pokered.gbc is newer
pokered.gbc: vendor/pokered/pokered.gbc
	cp vendor/pokered/pokered.gbc .
	@echo "Done! Output in pokered.gbc"

vendor/pokered/pokered.gbc:
	@echo "Building Pokemon Red ROM with Docker RGBDS..."
	cd vendor/pokered && make -j$$(nproc) RGBDS="docker run --rm -v $$(pwd):/work -w /work ghcr.io/gbdev/rgbds:v1.0.0 "

dist: pokered.gbc
	@echo "Creating distribution package..."
	# Clean previous build artifacts and old zip packages
	rm -rf $(DIST_DIR)
	rm -f dist_*.zip
	mkdir -p $(DIST_DIR)
	
	# Copy artifacts
	cp vendor/binjgb/out/Wasm/binjgb.js $(DIST_DIR)/
	cp vendor/binjgb/out/Wasm/binjgb.wasm $(DIST_DIR)/
	cp pokered.gbc $(DIST_DIR)/
	
	# Copy required directories
	cp -r battle emulator graphics mocks samples services $(DIST_DIR)/
	
	# Copy required files
	cp index.html index.tsx metadata.json package.json tsconfig.json vite.config.ts .gitignore $(DIST_DIR)/
	
	# Zip the contents
	cd $(DIST_DIR) && zip -r ../$(ZIP_FILE) .
	
	@echo "Package created at $(ZIP_FILE)"
	
	# Clean up
	rm -rf $(DIST_DIR)

clean:
	rm -rf $(DIST_DIR)
	rm -f dist_*.zip
	rm -f pokered.gbc
	rm -rf vendor/binjgb/out
	cd vendor/pokered && make clean