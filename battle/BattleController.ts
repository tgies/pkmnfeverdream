/**
 * BattleController - Manages the battle loop and Pokemon injection
 */

import { EmulatorWrapper } from '../emulator/EmulatorWrapper';
import { WRAM, POKEMON, encodeString } from '../emulator/MemoryMap';
import { 
  PokemonGenerationService, 
  type GeneratedPokemon 
} from '../services/PokemonGenerationService';
import { setupTestBattle, getBattleResult } from './BattleTrigger';
import { SpriteEncoder } from '../graphics/SpriteEncoder';

export type BattleState = 'idle' | 'generating' | 'waiting_for_generation' | 'in_battle' | 'waiting_for_game';

export interface BattleControllerOptions {
  onStateChange?: (state: BattleState) => void;
  onPokemonGenerated?: (pokemon: GeneratedPokemon) => void;
  onBattleEnd?: (result: 'win' | 'lose' | 'draw' | 'ran') => void;
}

export class BattleController {
  private emulator: EmulatorWrapper;
  private generationService: PokemonGenerationService | null = null;
  private spriteEncoder: SpriteEncoder;
  private options: BattleControllerOptions;
  
  private state: BattleState = 'waiting_for_game';
  private currentPokemon: GeneratedPokemon | null = null;
  private lastBattleState: number = 0;
  private battleCount: number = 0;
  private framesSinceLastCheck: number = 0;
  private gameReady: boolean = false;
  
  // Breakpoint-based injection state
  private static readonly LOAD_MON_FRONT_SPRITE_ADDR = 0x1665;
  private injectionPending: boolean = false;
  private breakpointInstalled: boolean = false;
  
  constructor(emulator: EmulatorWrapper, options: BattleControllerOptions = {}) {
    this.emulator = emulator;
    // Generation service can be set later via setGenerationService()
    this.spriteEncoder = new SpriteEncoder();
    this.options = options;
  }
  
  /**
   * Set the generation service (allows external control for parallel boot/generation)
   */
  setGenerationService(service: PokemonGenerationService): void {
    this.generationService = service;
  }
  
  /**
   * Inject a pre-generated Pokemon into the game
   * Called after both boot and generation are complete
   */
  injectGeneratedPokemon(pokemon: GeneratedPokemon): void {
    console.log('Injecting pre-generated Pokemon:', pokemon.name);
    this.currentPokemon = pokemon;
    this.gameReady = true;
    this.setupTestBattleMode();
    this.options.onPokemonGenerated?.(pokemon);
    this.setState('idle');
    
    // Install breakpoint NOW so it's ready when the battle starts
    // LoadMonFrontSprite will be called during battle transition, before wIsInBattle changes
    this.injectionPending = true;
    this.installInjectionBreakpoint();
  }
  
  /**
   * Get current state
   */
  getState(): BattleState {
    return this.state;
  }
  
  /**
   * Get current generated Pokemon
   */
  getCurrentPokemon(): GeneratedPokemon | null {
    return this.currentPokemon;
  }
  
  /**
   * Get battle count
   */
  getBattleCount(): number {
    return this.battleCount;
  }
  
  /**
   * Set state and notify
   */
  private setState(state: BattleState): void {
    if (this.state !== state) {
      this.state = state;
      this.options.onStateChange?.(state);
    }
  }
  
  /**
   * Generate the next Pokemon
   */
  async generateNextPokemon(): Promise<GeneratedPokemon> {
    this.setState('generating');
    
    try {
      if (!this.generationService) {
        throw new Error('Generation service not set');
      }
      const pokemon = await this.generationService.getNext();
      this.currentPokemon = pokemon;
      this.options.onPokemonGenerated?.(pokemon);
      
      // Set up the enemy Pokemon in game memory immediately
      // This must happen BEFORE the battle starts so the game uses our data
      this.setupTestBattleMode();
      
      this.setState('idle');
      return pokemon;
    } catch (error) {
      console.error('Failed to generate Pokemon:', error);
      this.setState('idle');
      throw error;
    }
  }
  
  /**
   * Setup TestBattle mode - this prepares the game for continuous battles
   */
  setupTestBattleMode(): void {
    if (!this.currentPokemon) {
      console.warn('No pokemon generated yet, cannot setup test battle');
      return;
    }
    
    console.log('Setting up TestBattle mode...');
    
    setupTestBattle(this.emulator, {
      playerPokemon: {
        species: POKEMON.PIKACHU,
        level: 50,
        name: 'PLAYER',
      },
      enemyPokemon: {
        species: POKEMON.RHYDON, // Will be overwritten with AI data
        level: this.currentPokemon.level,
        name: this.currentPokemon.name,
      },
    });
  }
  
  /**
   * Update - call every frame to monitor game state
   */
  update(): void {
    this.framesSinceLastCheck++;
    
    // Don't check every frame - every 10 frames is enough
    if (this.framesSinceLastCheck < 10) return;
    this.framesSinceLastCheck = 0;
    
    // Track game readiness
    if (!this.gameReady) {
      // Check if game has booted (check for some valid memory state)
      // The game is "ready" after it's past the initial boot
      this.gameReady = true;
      this.setState('idle');
      console.log('Game ready for input');
    }
    
    // Check battle state
    const currentBattleState = this.emulator.readMemory(WRAM.wIsInBattle);
    
    // Detect transition INTO battle
    if (currentBattleState !== 0 && this.lastBattleState === 0) {
      console.log('Battle started! State:', currentBattleState);
      this.setState('in_battle');
      
      // Breakpoint should already be installed from when Pokemon was prepared
      // If not, the injection may have already happened or will be missed
      if (!this.breakpointInstalled && this.currentPokemon) {
        console.warn('Battle started but breakpoint not installed - may have missed injection window');
      }
      
      // Start pre-fetching the NEXT Pokemon while battle runs
      console.log('🔮 Starting pre-fetch for next Pokemon...');
      this.generationService?.prefetch();
    }
    
    // Detect battle END
    if (currentBattleState === 0 && this.lastBattleState !== 0) {
      const result = getBattleResult(this.emulator);
      const resultMap: Record<number, 'win' | 'lose' | 'draw' | 'ran'> = {
        0: 'win',
        1: 'lose',
        2: 'draw',
        3: 'ran',
      };
      
      this.battleCount++;
      this.options.onBattleEnd?.(resultMap[result] ?? 'win');
      
      // Get next Pokemon (should already be ready from pre-fetch)
      this.prepareNextPokemon();
    }
    
    this.lastBattleState = currentBattleState;
  }
  
  /**
   * Prepare the next Pokemon after battle ends
   */
  private async prepareNextPokemon(): Promise<void> {
    // Check if next Pokemon is already ready
    if (this.generationService?.isReady()) {
      console.log('✅ Next Pokemon ready from pre-fetch!');
      const pokemon = this.generationService?.getNextIfReady();
      if (pokemon) {
        this.currentPokemon = pokemon;
        this.options.onPokemonGenerated?.(pokemon);
        // Set up the enemy in game memory for the next battle
        this.setupTestBattleMode();
        this.setState('idle');
        
        // Install breakpoint for next battle
        this.injectionPending = true;
        this.installInjectionBreakpoint();
        return;
      }
    }
    
    // Not ready - show waiting state
    console.log('⏳ Waiting for Pokemon generation to complete...');
    this.setState('waiting_for_generation');
    
    try {
      if (!this.generationService) {
        throw new Error('Generation service not set');
      }
      const pokemon = await this.generationService.getNext();
      this.currentPokemon = pokemon;
      this.options.onPokemonGenerated?.(pokemon);
      // Set up the enemy in game memory for the next battle
      this.setupTestBattleMode();
      this.setState('idle');
      
      // Install breakpoint for next battle
      this.injectionPending = true;
      this.installInjectionBreakpoint();
    } catch (error) {
      console.error('Failed to prepare next Pokemon:', error);
      this.setState('idle');
    }
  }
  
  /**
   * Force trigger a battle (for testing)
   */
  forceBattle(): void {
    if (!this.gameReady) {
      console.warn('Game not ready yet');
      return;
    }
    
    if (!this.currentPokemon) {
      console.warn('No pokemon generated yet');
      return;
    }
    
    // Set up test battle mode
    this.setupTestBattleMode();
  }

  /**
   * Install a breakpoint at LoadMonFrontSprite to intercept sprite loading
   */
  private installInjectionBreakpoint(): void {
    if (this.breakpointInstalled) {
      console.log('Breakpoint already installed, skipping');
      return;
    }
    
    console.log(`Installing breakpoint at LoadMonFrontSprite ($${BattleController.LOAD_MON_FRONT_SPRITE_ADDR.toString(16)})`);
    
    this.emulator.addBreakpoint(
      BattleController.LOAD_MON_FRONT_SPRITE_ADDR,
      () => this.onLoadMonFrontSpriteBreakpoint()
    );
    
    this.breakpointInstalled = true;
  }
  
  /**
   * Called when LoadMonFrontSprite breakpoint is hit
   * This is our one-shot injection point
   */
  private onLoadMonFrontSpriteBreakpoint(): void {
    // Check if we're actually in battle - LoadMonFrontSprite is also called on title screen
    const isInBattle = this.emulator.readMemory(WRAM.wIsInBattle);
    if (isInBattle === 0) {
      console.log('Breakpoint hit but not in battle (title screen?), letting normal code run');
      // Don't skip - let the normal sprite loading happen
      return;
    }
    
    if (!this.injectionPending || !this.currentPokemon) {
      console.log('Breakpoint hit in battle but no injection pending, skipping function');
      this.skipCurrentFunction();
      return;
    }
    
    console.log(`🎯 Breakpoint hit! Injecting ${this.currentPokemon.name}`);
    
    // ===== INJECT POKEMON DATA =====
    
    // Write enemy species (using Mew as base species)
    this.emulator.writeMemory(WRAM.wEnemyMonSpecies2, POKEMON.MEW);
    this.emulator.writeMemory(WRAM.wEnemyMonSpecies, POKEMON.MEW);
    
    // Write enemy nickname
    this.emulator.writeMemoryBlock(
      WRAM.wEnemyMonNick,
      encodeString(this.currentPokemon.name.toUpperCase())
    );
    
    // Write level
    this.emulator.writeMemory(WRAM.wEnemyMonLevel, this.currentPokemon.level);
    this.emulator.writeMemory(WRAM.wCurEnemyLevel, this.currentPokemon.level);
    
    // Write base stats if we have them
    if (this.currentPokemon.baseStats) {
      const stats = this.currentPokemon.baseStats;
      const statsAddr = WRAM.wEnemyMonBaseStats;
      this.emulator.writeMemory(statsAddr, stats.hp);
      this.emulator.writeMemory(statsAddr + 1, stats.attack);
      this.emulator.writeMemory(statsAddr + 2, stats.defense);
      this.emulator.writeMemory(statsAddr + 3, stats.speed);
      this.emulator.writeMemory(statsAddr + 4, stats.special);
    }
    
    // Write moves if we have them
    if (this.currentPokemon.moves?.length) {
      const movesAddr = WRAM.wEnemyMonMoves;
      for (let i = 0; i < 4; i++) {
        this.emulator.writeMemory(
          movesAddr + i,
          this.currentPokemon.moves[i] ?? 0
        );
      }
    }
    
    // ===== INJECT SPRITE =====
    this.injectSpriteSync(this.currentPokemon);
    
    // ===== SKIP ORIGINAL FUNCTION =====
    // We've already written to VRAM, so skip LoadMonFrontSprite to prevent overwrite
    this.skipCurrentFunction();
    
    // Mark injection done for this battle
    this.injectionPending = false;
    
    // Remove the breakpoint (one-shot)
    this.emulator.removeBreakpoint(BattleController.LOAD_MON_FRONT_SPRITE_ADDR);
    this.breakpointInstalled = false;
    
    console.log('✅ One-shot injection complete!');
  }
  
  /**
   * Skip the current function by jumping to a RET instruction
   */
  private skipCurrentFunction(): void {
    // Find a RET instruction (0xC9) to jump to
    const retAddr = this.findRetAddress();
    if (retAddr !== null) {
      console.log(`Skipping to RET at $${retAddr.toString(16)}`);
      this.emulator.setPC(retAddr);
    } else {
      console.warn('Could not find RET instruction, breakpoint may cause issues');
    }
  }
  
  // Known RET instruction address in bank 0 (after DisableLCD routine at $0060)
  // This is a safe RET to jump to that will just return to the caller
  private static readonly KNOWN_RET_ADDR = 0x0073;
  
  /**
   * Find a RET instruction in ROM to jump to
   */
  private findRetAddress(): number | null {
    // First try scanning forward from LoadMonFrontSprite
    const startAddr = BattleController.LOAD_MON_FRONT_SPRITE_ADDR;
    
    for (let offset = 1; offset < 200; offset++) {
      const addr = startAddr + offset;
      const opcode = this.emulator.readMemory(addr);
      if (opcode === 0xC9) { // RET
        return addr;
      }
    }
    
    // Fallback: use a known RET address in bank 0
    // From pokered disassembly, address $0073 contains a RET after DisableLCD
    console.log('Using fallback RET address');
    return BattleController.KNOWN_RET_ADDR;
  }
  
  /**
   * Synchronously inject sprite data to VRAM
   * Called within breakpoint callback - no setTimeout/async allowed
   */
  private injectSpriteSync(pokemon: GeneratedPokemon): void {
    let spriteData: Uint8Array | null = null;
    
    if (pokemon.sprite2bpp && pokemon.sprite2bpp.length > 0) {
      console.log('Using AI-generated sprite data');
      spriteData = pokemon.sprite2bpp;
    } else {
      // Fallback: we can't load async in breakpoint callback
      // Use a simple fallback sprite or skip sprite injection
      console.warn('No sprite2bpp data available, skipping sprite injection');
      return;
    }
    
    console.log(`Injecting ${spriteData.length} bytes of sprite data to VRAM 0x9000...`);
    
    // Use LCD Disable Hack for guaranteed VRAM access
    const lcdcAddr = 0xFF40;
    const originalLcdc = this.emulator.readMemory(lcdcAddr);
    const isLcdOn = (originalLcdc & 0x80) !== 0;
    
    // Disable LCD to ensure VRAM is accessible
    if (isLcdOn) {
      this.emulator.writeMemory(lcdcAddr, originalLcdc & 0x7F);
    }
    
    // Write sprite data to vFrontPic (0x9000)
    this.emulator.writeMemoryBlock(0x9000, spriteData);
    
    // Restore LCD
    if (isLcdOn) {
      this.emulator.writeMemory(lcdcAddr, originalLcdc);
    }
    
    // Verify write
    const check = this.emulator.readMemory(0x9000);
    if (check !== spriteData[0]) {
      console.warn(`Sprite injection mismatch! Expected ${spriteData[0]}, got ${check}`);
    } else {
      console.log('Sprite injection verified!');
    }
  }
}

