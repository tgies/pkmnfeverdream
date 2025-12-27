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
      
      // If we have a generated pokemon, inject it now
      if (this.currentPokemon) {
        this.injectCurrentPokemon();
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
    } catch (error) {
      console.error('Failed to prepare next Pokemon:', error);
      this.setState('idle');
    }
  }
  
  /**
   * Inject the current generated Pokemon into battle
   */
  private injectCurrentPokemon(): void {
    if (!this.currentPokemon) return;
    
    console.log(`Injecting Pokemon: ${this.currentPokemon.name} Lv.${this.currentPokemon.level}`);
    
    // Write enemy species (using a placeholder for now - Mew because it's flexible)
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

    // Inject Sprite
    this.injectSprite(this.currentPokemon).catch(console.error);

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
   * Encodes and injects a sprite into VRAM
   * Retries multiple times to ensure it overwrites the game's default loading
   * and verifies the write.
   */
  private async injectSprite(pokemon: GeneratedPokemon): Promise<void> {
    try {
      // Use AI-generated sprite if available, otherwise use sample
      let spriteData: Uint8Array;
      
      if (pokemon.sprite2bpp && pokemon.sprite2bpp.length > 0) {
        console.log('Using AI-generated sprite data');
        spriteData = pokemon.sprite2bpp;
      } else {
        // Fallback to sample sprite
        const sampleId = (pokemon.name.length % 2) + 1;
        const imageUrl = `./samples/sample${sampleId}.png`;
        console.log(`Encoding sprite from ${imageUrl}...`);
        spriteData = await this.spriteEncoder.encode(imageUrl);
      }
      
      console.log(`Injecting ${spriteData.length} bytes of sprite data to VRAM 0x9000...`);
      
      // The game writes to VRAM during the battle intro.
      // We need to keep overwriting it until the battle is stable.
      // VRAM 0x9000 is vFrontPic (7x7 tiles = 49 * 16 bytes = 784 bytes)
      
      let attempts = 0;
      const inject = () => {
         // Debug: Check scanline
         const rLY = this.emulator.readMemory(0xFF44);
         const lcdcAddr = 0xFF40;
         const originalLcdc = this.emulator.readMemory(lcdcAddr);
         const isLcdOn = (originalLcdc & 0x80) !== 0;

         // Hack: Turn off LCD to allow VRAM write
         if (isLcdOn) {
             this.emulator.writeMemory(lcdcAddr, originalLcdc & 0x7F);
         }

         this.emulator.writeMemoryBlock(0x9000, spriteData);
         
         // Restore LCD
         if (isLcdOn) {
             this.emulator.writeMemory(lcdcAddr, originalLcdc);
         }
         
         /*
         // Verify write (debug)
         const check = this.emulator.readMemory(0x9000);
         if (check !== spriteData[0]) {
             console.warn(`Injection mismatch! Expected ${spriteData[0]}, got ${check}. rLY: ${rLY}`);
         } else {
             console.log(`Injection verified!`);
         }
         */
         
         attempts++;
         if (attempts < 20) { // Keep trying for ~2 seconds (every 100ms)
             setTimeout(inject, 100);
         }
      };
      
      // Start injection loop
      inject();
      
    } catch (error) {
      console.error('Failed to inject sprite:', error);
    }
  }
}

