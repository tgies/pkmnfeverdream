/**
 * AI Pokemon Battles - Main Entry Point for AI Studio
 */

import { EmulatorWrapper } from './emulator/EmulatorWrapper';
import { BattleController, type BattleState } from './battle/BattleController';
import { PokemonGenerationService, type GeneratedPokemon } from './services/PokemonGenerationService';
import { getTypeName } from './services/gemini';
import { ConfigService } from './services/ConfigService';
import { SpriteEncoder } from './graphics/SpriteEncoder';

// Global emulator stub required by binjgb when compiled with RGBDS_LIVE
// The C code calls EM_ASM({emulator.serialCallback($0);}, value) for serial debugging
(window as any).emulator = {
  serialCallback: (_value: number) => {
    // No-op - we don't use serial debugging
  }
};


// DOM elements
const canvas = document.getElementById('screen') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const statusEl = document.getElementById('status')!;
const generationOverlay = document.getElementById('generation-overlay')!;
const rawImageEl = document.getElementById('raw-image') as HTMLImageElement;
const infoEl = document.getElementById('pokemon-info')!;

// Settings DOM elements
const namePromptEl = document.getElementById('name-prompt') as HTMLTextAreaElement;
const imagePromptEl = document.getElementById('image-prompt') as HTMLTextAreaElement;
const thresholdBlackEl = document.getElementById('threshold-black') as HTMLInputElement;
const thresholdDarkEl = document.getElementById('threshold-dark') as HTMLInputElement;
const thresholdLightEl = document.getElementById('threshold-light') as HTMLInputElement;
const thresholdBlackValEl = document.getElementById('threshold-black-val')!;
const thresholdDarkValEl = document.getElementById('threshold-dark-val')!;
const thresholdLightValEl = document.getElementById('threshold-light-val')!;
const thresholdPreviewEl = document.getElementById('threshold-preview') as HTMLCanvasElement;
const regenerateBtnEl = document.getElementById('regenerate-btn') as HTMLButtonElement;
const resetNamePromptEl = document.getElementById('reset-name-prompt') as HTMLButtonElement;
const resetImagePromptEl = document.getElementById('reset-image-prompt') as HTMLButtonElement;

// Application state
let emulator: EmulatorWrapper | null = null;
let battleController: BattleController | null = null;
let generationService: PokemonGenerationService | null = null;
let running = false;
let paused = false;
let currentSpriteDataUrl: string | null = null; // Track current sprite for preview updates
const spriteEncoder = new SpriteEncoder(); // For preview generation

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
 * Handle touch input from mobile controls
 */
function setupMobileControls(): void {
  const mobileControls = document.getElementById('mobile-controls');
  if (!mobileControls) return;

  const buttons = mobileControls.querySelectorAll('[data-button]');
  
  buttons.forEach(button => {
    const buttonName = button.getAttribute('data-button') as 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start' | 'select';
    if (!buttonName) return;

    // Handle touch start - button pressed
    button.addEventListener('touchstart', (e) => {
      e.preventDefault();
      button.classList.add('active');
      if (emulator && injectionDone) {
        emulator.setJoypad({ [buttonName]: true });
      }
    }, { passive: false });

    // Handle touch end - button released
    button.addEventListener('touchend', (e) => {
      e.preventDefault();
      button.classList.remove('active');
      if (emulator) {
        emulator.setJoypad({ [buttonName]: false });
      }
    }, { passive: false });

    // Handle touch cancel (e.g., if user drags finger off button)
    button.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      button.classList.remove('active');
      if (emulator) {
        emulator.setJoypad({ [buttonName]: false });
      }
    }, { passive: false });

    // Also handle mouse events for testing on desktop
    button.addEventListener('mousedown', (e) => {
      e.preventDefault();
      button.classList.add('active');
      if (emulator && injectionDone) {
        emulator.setJoypad({ [buttonName]: true });
      }
    });

    button.addEventListener('mouseup', (e) => {
      e.preventDefault();
      button.classList.remove('active');
      if (emulator) {
        emulator.setJoypad({ [buttonName]: false });
      }
    });

    button.addEventListener('mouseleave', () => {
      button.classList.remove('active');
      if (emulator) {
        emulator.setJoypad({ [buttonName]: false });
      }
    });
  });
}

/**
 * Update the 2bpp threshold preview canvas
 */
async function updateThresholdPreview(): Promise<void> {
  if (!currentSpriteDataUrl) return;
  
  try {
    const thresholds = ConfigService.getThresholds();
    const previewData = await spriteEncoder.generatePreview(currentSpriteDataUrl, thresholds);
    
    const previewCtx = thresholdPreviewEl.getContext('2d');
    if (previewCtx) {
      previewCtx.putImageData(previewData, 0, 0);
    }
  } catch (error) {
    console.error('Failed to update threshold preview:', error);
  }
}

/**
 * Set up settings pane interactions
 */
function setupSettings(): void {
  // Initialize UI from ConfigService state
  const config = ConfigService.getState();
  namePromptEl.value = config.namePromptTemplate;
  imagePromptEl.value = config.imagePromptTemplate;
  thresholdBlackEl.value = String(config.thresholds.black);
  thresholdDarkEl.value = String(config.thresholds.darkGray);
  thresholdLightEl.value = String(config.thresholds.lightGray);
  thresholdBlackValEl.textContent = String(config.thresholds.black);
  thresholdDarkValEl.textContent = String(config.thresholds.darkGray);
  thresholdLightValEl.textContent = String(config.thresholds.lightGray);

  // Prompt template changes (save on blur to avoid constant updates while typing)
  namePromptEl.addEventListener('blur', () => {
    ConfigService.setNamePromptTemplate(namePromptEl.value);
    console.log('📝 Name prompt template updated');
  });

  imagePromptEl.addEventListener('blur', () => {
    ConfigService.setImagePromptTemplate(imagePromptEl.value);
    console.log('📝 Image prompt template updated');
  });

  // Reset buttons for prompts
  resetNamePromptEl.addEventListener('click', () => {
    const defaultPrompt = ConfigService.resetNamePrompt();
    namePromptEl.value = defaultPrompt;
    console.log('↺ Name prompt reset to default');
  });

  resetImagePromptEl.addEventListener('click', () => {
    const defaultPrompt = ConfigService.resetImagePrompt();
    imagePromptEl.value = defaultPrompt;
    console.log('↺ Image prompt reset to default');
  });

  // Threshold slider changes (live update)
  thresholdBlackEl.addEventListener('input', () => {
    const value = parseInt(thresholdBlackEl.value, 10);
    thresholdBlackValEl.textContent = String(value);
    ConfigService.setThresholds({ black: value });
    updateThresholdPreview();
  });

  thresholdDarkEl.addEventListener('input', () => {
    const value = parseInt(thresholdDarkEl.value, 10);
    thresholdDarkValEl.textContent = String(value);
    ConfigService.setThresholds({ darkGray: value });
    updateThresholdPreview();
  });

  thresholdLightEl.addEventListener('input', () => {
    const value = parseInt(thresholdLightEl.value, 10);
    thresholdLightValEl.textContent = String(value);
    ConfigService.setThresholds({ lightGray: value });
    updateThresholdPreview();
  });

  // Regenerate button
  regenerateBtnEl.addEventListener('click', async () => {
    if (!generationService) return;
    
    console.log('🔄 Regenerating with new settings...');
    updateStatus('🔄 Regenerating with new settings...');
    
    // Invalidate queue and trigger new generation
    generationService.invalidateQueue();
    setGenerationOverlay(true);
    
    try {
      const pokemon = await generationService.getNext();
      
      if (battleController) {
        battleController.injectGeneratedPokemon(pokemon);
      }
      
      // Update preview
      if (pokemon.spriteDataUrl) {
        currentSpriteDataUrl = pokemon.spriteDataUrl;
        rawImageEl.src = pokemon.spriteDataUrl;
        rawImageEl.classList.add('loaded');
        updateThresholdPreview();
      }
      
      // Update info display
      onPokemonGenerated(pokemon);
      
      setGenerationOverlay(false);
      updateStatus(`✅ Regenerated: ${pokemon.name} (Lv.${pokemon.level})`);
    } catch (error) {
      console.error('Regeneration failed:', error);
      updateStatus('❌ Regeneration failed');
      setGenerationOverlay(false);
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
  
  // Update raw image and track for preview
  if (pokemon.spriteDataUrl) {
    currentSpriteDataUrl = pokemon.spriteDataUrl;
    rawImageEl.src = pokemon.spriteDataUrl;
    rawImageEl.classList.add('loaded');
    updateThresholdPreview();
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
  // Set up settings pane immediately (doesn't depend on ROM/emulator)
  setupSettings();
  
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
    setupMobileControls();
    
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