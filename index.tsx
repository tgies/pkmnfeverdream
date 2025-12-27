/**
 * AI Pokemon Battles - Main Entry Point for AI Studio
 */

import { EmulatorWrapper } from './emulator/EmulatorWrapper';
import { BattleController, type BattleState } from './battle/BattleController';
import { PokemonGenerationService, type GeneratedPokemon } from './services/PokemonGenerationService';
import { getTypeName } from './services/gemini';

// DOM elements
const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const statusEl = document.getElementById('status')!;
const generationOverlay = document.getElementById('generation-overlay')!;
const rawImageEl = document.getElementById('raw-image') as HTMLImageElement;
const infoEl = document.getElementById('pokemon-info')!;

// Application state
let emulator: EmulatorWrapper | null = null;
let battleController: BattleController | null = null;
let generationService: PokemonGenerationService | null = null;
let running = false;
let paused = false;

// Screen dimensions
const GB_WIDTH = 160;
const GB_HEIGHT = 144;
const SCALE = 4;

// Game boot state
// Pokemon Red takes roughly 10 seconds to get to title screen:
// - Nintendo logo: ~2 seconds
// - Game Freak logo: ~3 seconds  
// - Title screen animation: ~3 seconds
// We wait ~11 seconds (660 frames at 60fps) to be safe
const BOOT_FRAMES = 660;
let bootFrameCount = 0;
let gameBooted = false;

// Generation state (decoupled from boot)
let firstPokemon: GeneratedPokemon | null = null;
let generationComplete = false;
let injectionDone = false;

/**
 * Update the status display
 */
function updateStatus(text: string): void {
  statusEl.textContent = text;
}

/**
 * Show/hide generation overlay
 */
function setGenerationOverlay(visible: boolean): void {
  if (visible) {
    generationOverlay.classList.remove('hidden');
    paused = true;
  } else {
    generationOverlay.classList.add('hidden');
    paused = false;
  }
}

/**
 * Render the emulator frame to canvas
 */
function renderFrame(): void {
  if (!emulator) return;
  
  const frameBuffer = emulator.getFrameBuffer();
  if (!frameBuffer) return;
  
  // Create ImageData from frame buffer (RGBA format)
  const imageData = ctx.createImageData(GB_WIDTH, GB_HEIGHT);
  
  // Copy frame buffer to image data
  for (let i = 0; i < GB_WIDTH * GB_HEIGHT * 4; i++) {
    imageData.data[i] = frameBuffer[i];
  }
  
  // Scale up to canvas size
  ctx.imageSmoothingEnabled = false;
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = GB_WIDTH;
  tempCanvas.height = GB_HEIGHT;
  tempCanvas.getContext('2d')!.putImageData(imageData, 0, 0);
  
  ctx.drawImage(tempCanvas, 0, 0, GB_WIDTH * SCALE, GB_HEIGHT * SCALE);
}

/**
 * Check if we can proceed - both game booted AND generation complete
 */
function tryInjectFirstPokemon(): void {
  if (injectionDone) return;
  if (!gameBooted || !generationComplete || !firstPokemon || !battleController) return;
  
  console.log('Both game booted and generation complete - injecting Pokemon!');
  
  // Now it's safe to inject the Pokemon into game memory
  battleController.injectGeneratedPokemon(firstPokemon);
  injectionDone = true;
  
  setGenerationOverlay(false);
  updateStatus(`✅ Ready! Next: ${firstPokemon.name} (Lv.${firstPokemon.level}) | Use arrow keys, Z/X, Enter`);
}

/**
 * Main game loop
 */
function gameLoop(): void {
  if (!running || !emulator) {
    return;
  }
  
  // Always run emulator (don't pause during generation - we want game to boot!)
  emulator.runFrame();
  
  // Track boot progress
  if (!gameBooted) {
    bootFrameCount++;
    if (bootFrameCount >= BOOT_FRAMES) {
      gameBooted = true;
      console.log('Game has booted!');
      tryInjectFirstPokemon();
    }
  }
  
  // Update battle controller only after injection is done
  if (injectionDone) {
    battleController?.update();
  }
  
  // Always render
  renderFrame();
  
  // Schedule next frame
  requestAnimationFrame(gameLoop);
}

/**
 * Start generating first Pokemon (runs in parallel with boot)
 */
async function startGeneration(): Promise<void> {
  if (!generationService) return;
  
  console.log('Starting Pokemon generation (parallel with boot)...');
  
  try {
    firstPokemon = await generationService.getNext();
    generationComplete = true;
    console.log('Generation complete:', firstPokemon.name);
    
    // Check if we can inject now
    tryInjectFirstPokemon();
  } catch (error) {
    console.error('Failed to generate first Pokemon:', error);
    updateStatus('❌ Failed to generate Pokemon');
    setGenerationOverlay(false);
  }
}

/**
 * Handle keyboard input
 */
function setupKeyboardInput(): void {
  const keyMap: Record<string, 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start' | 'select'> = {
    'ArrowUp': 'up',
    'ArrowDown': 'down',
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'KeyZ': 'b',
    'KeyX': 'a',
    'Enter': 'start',
    'ShiftRight': 'select',
  };
  
  document.addEventListener('keydown', (e) => {
    const button = keyMap[e.code];
    if (button && emulator && injectionDone) {
      emulator.setJoypad({ [button]: true });
    }
  });
  
  document.addEventListener('keyup', (e) => {
    const button = keyMap[e.code];
    if (button && emulator) {
      emulator.setJoypad({ [button]: false });
    }
  });
}

/**
 * Handle battle controller events
 */
function onBattleStateChange(state: BattleState): void {
  switch (state) {
    case 'generating':
      updateStatus('🎨 Generating new AI Pokémon...');
      break;
    case 'waiting_for_generation':
      updateStatus('⏳ Waiting for AI generation...');
      setGenerationOverlay(true);
      break;
    case 'in_battle':
      updateStatus('⚔️ Battle in progress!');
      setGenerationOverlay(false);
      break;
    case 'waiting_for_game':
      updateStatus('⏳ Waiting for game to initialize...');
      break;
    case 'idle':
      setGenerationOverlay(false);
      if (battleController) {
        const pokemon = battleController.getCurrentPokemon();
        const count = battleController.getBattleCount();
        if (pokemon) {
          updateStatus(`✅ Ready! Next: ${pokemon.name} (Lv.${pokemon.level}) | Battles: ${count}`);
        }
      }
      break;
  }
}

function onPokemonGenerated(pokemon: GeneratedPokemon): void {
  console.log('Generated Pokemon:', pokemon.name, 'Lv.', pokemon.level);
  setGenerationOverlay(false);
  
  // Update raw image
  if (pokemon.spriteDataUrl) {
    rawImageEl.src = pokemon.spriteDataUrl;
    rawImageEl.classList.add('loaded');
  } else {
    rawImageEl.src = '';
    rawImageEl.classList.remove('loaded');
  }
  
  // Update info
  const type1 = getTypeName(pokemon.types[0]);
  const type2 = pokemon.types[1] !== pokemon.types[0] ? getTypeName(pokemon.types[1]) : null;
  
  infoEl.innerHTML = `
    <div class="info-row">
      <span class="info-label">Name</span>
      <span>${pokemon.name}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Type</span>
      <span>${type1}${type2 ? '/' + type2 : ''}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Level</span>
      <span>${pokemon.level}</span>
    </div>
     <div class="info-row">
      <span class="info-label">Stats (HP/A/D/S/S)</span>
      <span>${pokemon.stats.hp}/${pokemon.stats.atk}/${pokemon.stats.def}/${pokemon.stats.spd}/${pokemon.stats.spc}</span>
    </div>
  `;
}

function onBattleEnd(result: 'win' | 'lose' | 'draw' | 'ran'): void {
  const emoji = result === 'win' ? '🎉' : result === 'lose' ? '😢' : result === 'ran' ? '🏃' : '🤝';
  console.log(`Battle ended: ${emoji} ${result.toUpperCase()}`);
}

/**
 * Initialize the application
 */
async function init(): Promise<void> {
  updateStatus('Loading emulator...');
  
  try {
    // Load the ROM
    updateStatus('Loading ROM...');
    const romResponse = await fetch('./pokered.gbc');
    if (!romResponse.ok) {
      throw new Error('ROM not found. Please ensure pokered.gbc is uploaded.');
    }
    const romData = new Uint8Array(await romResponse.arrayBuffer());
    
    // Initialize emulator
    updateStatus('Initializing emulator...');
    emulator = new EmulatorWrapper();
    await emulator.init(romData);
    
    // Expose for debugging
    (window as any).emulator = emulator;
    
    // Create generation service (separate from battle controller for parallel generation)
    generationService = new PokemonGenerationService({ defaultLevel: 10 });
    
    // Set up battle controller
    battleController = new BattleController(emulator, {
      onStateChange: onBattleStateChange,
      onPokemonGenerated: onPokemonGenerated,
      onBattleEnd: onBattleEnd,
    });
    
    // Share the generation service with battle controller
    battleController.setGenerationService(generationService);
    
    // Set up input
    setupKeyboardInput();
    
    // Show overlay while booting + generating
    setGenerationOverlay(true);
    updateStatus('⏳ Booting game & generating Pokémon...');
    
    // Start BOTH in parallel:
    // 1. Start game loop (game boots while we generate)
    running = true;
    gameLoop();
    
    // 2. Start generation (runs in parallel with boot)
    startGeneration();
    
  } catch (error) {
    updateStatus(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('Initialization error:', error);
  }
}

// Start the application
init();