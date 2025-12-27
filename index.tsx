/**
 * AI Pokemon Battles - Main Entry Point for AI Studio
 */

import { EmulatorWrapper } from './emulator/EmulatorWrapper';
import { BattleController, type BattleState } from './battle/BattleController';
import { PokemonGenerationService, type GeneratedPokemon } from './services/PokemonGenerationService';
import { getTypeName } from './services/gemini';
import { ConfigService } from './services/ConfigService';
import { SpriteEncoder } from './graphics/SpriteEncoder';
import { cameraService } from './services/CameraService';

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

// Camera Mode DOM elements
const gameContainerEl = document.getElementById('game-container')!;
const infoPanelEl = document.getElementById('info-panel')!;
const cameraPreviewEl = document.getElementById('camera-preview') as HTMLVideoElement;
const photoPreviewEl = document.getElementById('photo-preview') as HTMLImageElement;
const cameraModeBtn = document.getElementById('camera-mode-btn') as HTMLButtonElement;
const shutterBtn = document.getElementById('shutter-btn') as HTMLButtonElement;
const retakeBtn = document.getElementById('retake-btn') as HTMLButtonElement;
const usePhotoBtn = document.getElementById('use-photo-btn') as HTMLButtonElement;
const cameraPromptEl = document.getElementById('camera-prompt') as HTMLTextAreaElement;
const cameraPromptInlineEl = document.getElementById('camera-prompt-inline') as HTMLTextAreaElement;
const resetCameraPromptEl = document.getElementById('reset-camera-prompt') as HTMLButtonElement;
const clearCameraSourceEl = document.getElementById('clear-camera-source') as HTMLButtonElement;
const flipCameraBtn = document.getElementById('flip-camera-btn') as HTMLButtonElement;

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

// Camera mode state
let cameraMode = false;
let capturedPhotoDataUrl: string | null = null;
let cameraSourceActive = false; // Whether we're using camera photo for generation

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
 * Enter camera mode - show camera preview, hide emulator
 */
async function enterCameraMode(): Promise<void> {
  if (cameraMode) return;
  
  if (!cameraService.isAvailable()) {
    updateStatus('❌ Camera not available');
    return;
  }
  
  try {
    await cameraService.startCamera(cameraPreviewEl);
    cameraMode = true;
    gameContainerEl.classList.add('camera-mode');
    cameraModeBtn.classList.add('active');
    capturedPhotoDataUrl = null;
    gameContainerEl.classList.remove('photo-captured');
    
    // Mirror preview if using front camera
    const isFrontCamera = cameraService.getFacingMode() === 'user';
    cameraPreviewEl.classList.toggle('mirrored', isFrontCamera);
    
    updateStatus('📷 Camera mode - Take a photo!');
  } catch (error) {
    console.error('Failed to start camera:', error);
    updateStatus('❌ Failed to access camera');
  }
}

/**
 * Exit camera mode - hide camera, show emulator
 */
function exitCameraMode(): void {
  if (!cameraMode) return;
  
  cameraService.stopCamera();
  cameraMode = false;
  gameContainerEl.classList.remove('camera-mode', 'photo-captured');
  cameraModeBtn.classList.remove('active');
  capturedPhotoDataUrl = null;
  
  if (injectionDone && battleController) {
    const pokemon = battleController.getCurrentPokemon();
    if (pokemon) {
      updateStatus(`✅ Back to game! Next: ${pokemon.name} (Lv.${pokemon.level})`);
    }
  }
}

/**
 * Capture photo from camera
 */
function capturePhoto(): void {
  if (!cameraMode) return;
  
  const photoData = cameraService.captureSquareFrame();
  if (!photoData) {
    updateStatus('❌ Failed to capture photo');
    return;
  }
  
  capturedPhotoDataUrl = photoData;
  photoPreviewEl.src = photoData;
  gameContainerEl.classList.add('photo-captured');
  updateStatus('📸 Photo captured! Use it or retake.');
}

/**
 * Activate camera source for sprite generation
 */
async function activateCameraSource(): Promise<void> {
  if (!capturedPhotoDataUrl) return;
  
  cameraSourceActive = true;
  document.body.classList.add('camera-source-active');
  infoPanelEl.classList.add('camera-source-active');
  
  // Store the photo for the generation service
  if (generationService) {
    generationService.setCameraSource(capturedPhotoDataUrl);
    // Throw out any queued Pokemon - we want fresh photo-based ones!
    generationService.invalidateQueue();
  }
  
  // Exit camera mode and return to game
  exitCameraMode();
  
  // Immediately generate a new Pokemon from the photo
  if (generationService && battleController) {
    updateStatus('📷 Generating Pokemon from your photo...');
    setGenerationOverlay(true);
    
    try {
      const pokemon = await generationService.getNext();
      battleController.injectGeneratedPokemon(pokemon);
      onPokemonGenerated(pokemon);
      setGenerationOverlay(false);
      updateStatus(`📷 Ready! Next: ${pokemon.name} (Lv.${pokemon.level}) - from your photo!`);
    } catch (error) {
      console.error('Failed to generate from photo:', error);
      updateStatus('❌ Failed to generate from photo');
      setGenerationOverlay(false);
    }
  } else {
    updateStatus('📷 Camera source active! Next Pokemon will be from your photo.');
  }
}

/**
 * Deactivate camera source, return to normal generation
 */
function deactivateCameraSource(): void {
  cameraSourceActive = false;
  document.body.classList.remove('camera-source-active');
  infoPanelEl.classList.remove('camera-source-active');
  
  if (generationService) {
    generationService.clearCameraSource();
    generationService.invalidateQueue();
  }
  
  updateStatus('🎨 Normal generation mode restored');
}

/**
 * Set up camera mode interactions
 */
function setupCameraMode(): void {
  // Initialize camera prompts from ConfigService
  const config = ConfigService.getState();
  cameraPromptEl.value = config.cameraPromptTemplate;
  cameraPromptInlineEl.value = config.cameraPromptTemplate;
  
  // Camera mode toggle button
  cameraModeBtn.addEventListener('click', () => {
    if (cameraMode) {
      exitCameraMode();
    } else {
      enterCameraMode();
    }
  });
  
  // Shutter button
  shutterBtn.addEventListener('click', capturePhoto);
  
  // Flip camera button (front/back toggle)
  flipCameraBtn.addEventListener('click', async () => {
    try {
      await cameraService.flipCamera();
      const mode = cameraService.getFacingMode();
      
      // Mirror preview if using front camera
      cameraPreviewEl.classList.toggle('mirrored', mode === 'user');
      
      updateStatus(`📷 Switched to ${mode === 'user' ? 'front' : 'back'} camera`);
    } catch (error) {
      console.error('Failed to flip camera:', error);
      updateStatus('❌ Failed to switch camera');
    }
  });
  
  // Retake button
  retakeBtn.addEventListener('click', () => {
    capturedPhotoDataUrl = null;
    gameContainerEl.classList.remove('photo-captured');
    photoPreviewEl.src = '';
    updateStatus('📷 Camera mode - Take a photo!');
  });
  
  // Use photo button
  usePhotoBtn.addEventListener('click', activateCameraSource);
  
  // Inline camera prompt changes (syncs to ConfigService and the other textarea)
  cameraPromptInlineEl.addEventListener('input', () => {
    ConfigService.setCameraPromptTemplate(cameraPromptInlineEl.value);
    cameraPromptEl.value = cameraPromptInlineEl.value;
  });
  
  // Settings pane camera prompt changes (syncs to inline prompt)
  cameraPromptEl.addEventListener('blur', () => {
    ConfigService.setCameraPromptTemplate(cameraPromptEl.value);
    cameraPromptInlineEl.value = cameraPromptEl.value;
    console.log('📝 Camera prompt template updated');
  });
  
  // Reset camera prompt (updates both textareas)
  resetCameraPromptEl.addEventListener('click', () => {
    const defaultPrompt = ConfigService.resetCameraPrompt();
    cameraPromptEl.value = defaultPrompt;
    cameraPromptInlineEl.value = defaultPrompt;
    console.log('↺ Camera prompt reset to default');
  });
  
  // Clear camera source button
  clearCameraSourceEl.addEventListener('click', deactivateCameraSource);
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
    setupCameraMode();
    
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