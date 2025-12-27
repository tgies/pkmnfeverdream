
# Makefile for Poke-AI Fever Dream

.PHONY: all rom dist clean

# Timestamp for the distribution package
TIMESTAMP := $(shell date +%Y%m%d_%H%M%S)
DIST_DIR := dist_tmp
ZIP_FILE := dist_$(TIMESTAMP).zip
SCRIPT_DIR := $(shell pwd)
# For Windows compatibility if needed, though the scripts assume bash/unix tools
# The user env is Windows but using bash scripts, so likely WSL or Git Bash.
# We will use standard unix commands as per the shell scripts.

all: dist

# Build the ROM using the same Docker command as build-rom.sh
rom:
	@echo "Building Pokemon Red ROM with Docker RGBDS..."
	cd vendor/pokered && make -j$$(nproc) RGBDS="docker run --rm -v $$(pwd):/work -w /work ghcr.io/gbdev/rgbds:v1.0.0 "
	cp vendor/pokered/pokered.gbc .
	@echo "Done! Output in pokered.gbc"

# Create the distribution package
dist: rom
	@echo "Creating distribution package..."
	# Clean previous build artifacts and old zip packages
	rm -rf $(DIST_DIR)
	rm -f dist_*.zip
	mkdir -p $(DIST_DIR)
	
	# Copy artifacts
	cp vendor/binjgb/docs/binjgb.js $(DIST_DIR)/
	cp vendor/binjgb/docs/binjgb.wasm $(DIST_DIR)/
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
	
	# Optional: Clean vendor/pokered if desired. 
	# The original build-rom.sh didn't strictly clean it, but it's good practice.
	# Commenting out to strictly match "remove build artifacts" of the repo itself first, 
	# but the plan said "Runs clean in vendor/pokered".
	cd vendor/pokered && make clean
