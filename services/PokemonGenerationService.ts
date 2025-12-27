/**
 * Pokemon Generation Service
 * Handles async generation with pre-fetch queue for seamless gameplay
 */

import { 
  isApiAvailable, 
  generatePokemonName, 
  generateSpriteImage, 
  generateRandomStats,
  getRandomTypeId,
  getTypeName 
} from './gemini';
import { generateMockPokemon, mockGenerateImage } from '../mocks/MockGeminiService';
import { encodeString } from '../emulator/MemoryMap';
import { SpriteEncoder } from '../graphics/SpriteEncoder';

// Common moves (from pokered move_constants.asm)
const MOVES = {
  TACKLE: 0x21,
  SCRATCH: 0x0A,
  EMBER: 0x34,
  WATER_GUN: 0x37,
  VINE_WHIP: 0x16,
  THUNDERSHOCK: 0x54,
  QUICK_ATTACK: 0x62,
  BITE: 0x2C,
};

const MOVE_LIST = Object.values(MOVES);

export interface GeneratedPokemon {
  name: string;
  nameEncoded: Uint8Array;
  sprite2bpp: Uint8Array;
  spriteDataUrl?: string; // Original AI-generated image
  types: [number, number];
  stats: {
    hp: number;
    atk: number;
    def: number;
    spd: number;
    spc: number;
  };
  baseStats?: {
    hp: number;
    attack: number;
    defense: number;
    speed: number;
    special: number;
  };
  moves: number[];
  level: number;
}

export type GenerationState = 'idle' | 'generating' | 'ready' | 'error';

export interface GenerationStateChange {
  state: GenerationState;
  pokemon?: GeneratedPokemon;
  error?: Error;
}

/**
 * Pokemon Generation Service with pre-fetch queue
 */
export class PokemonGenerationService {
  private queue: GeneratedPokemon[] = [];
  private generating: boolean = false;
  private pendingPromise: Promise<GeneratedPokemon> | null = null;
  private spriteEncoder: SpriteEncoder;
  private defaultLevel: number = 10;
  private onStateChange?: (change: GenerationStateChange) => void;
  
  constructor(options?: { 
    defaultLevel?: number;
    onStateChange?: (change: GenerationStateChange) => void;
  }) {
    this.defaultLevel = options?.defaultLevel ?? 10;
    this.onStateChange = options?.onStateChange;
    this.spriteEncoder = new SpriteEncoder();
  }
  
  /**
   * Check if a Pokemon is ready in the queue
   */
  isReady(): boolean {
    return this.queue.length > 0;
  }
  
  /**
   * Check if currently generating
   */
  isGenerating(): boolean {
    return this.generating;
  }
  
  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }
  
  /**
   * Invalidate (clear) all queued Pokemon
   * Used when config changes require regeneration with new settings
   */
  invalidateQueue(): void {
    console.log(`🗑️ Invalidating ${this.queue.length} queued Pokemon`);
    this.queue = [];
    // Note: if generation is in progress, it will complete but the result
    // may use old settings. The caller should trigger a new generation after.
  }
  
  /**
   * Get next Pokemon from queue (non-blocking)
   * Returns null if none ready
   */
  getNextIfReady(): GeneratedPokemon | null {
    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }
    return null;
  }
  
  /**
   * Get next Pokemon, waiting if necessary
   */
  async getNext(): Promise<GeneratedPokemon> {
    // If we have one ready, return it
    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }
    
    // If we're already generating, wait for it
    if (this.pendingPromise) {
      const pokemon = await this.pendingPromise;
      // Remove from queue if it was added there
      const idx = this.queue.indexOf(pokemon);
      if (idx >= 0) {
        this.queue.splice(idx, 1);
      }
      return pokemon;
    }
    
    // Otherwise generate now
    const pokemon = await this.generateOne();
    // generateOne() pushes to queue, but since we're returning directly,
    // we need to remove it from queue to avoid double-consumption
    const idx = this.queue.indexOf(pokemon);
    if (idx >= 0) {
      this.queue.splice(idx, 1);
    }
    return pokemon;
  }
  
  /**
   * Start pre-fetching next Pokemon in background
   */
  prefetch(): void {
    if (this.generating || this.queue.length > 0) {
      return; // Already generating or have one ready
    }
    
    console.log('🔮 Pre-generating next Pokemon in background...');
    this.generateOne().catch(err => {
      console.error('Pre-fetch failed:', err);
    });
  }
  
  /**
   * Generate one Pokemon (internal)
   */
  private async generateOne(): Promise<GeneratedPokemon> {
    if (this.generating && this.pendingPromise) {
      return this.pendingPromise;
    }
    
    this.generating = true;
    this.onStateChange?.({ state: 'generating' });
    
    this.pendingPromise = this.doGenerate();
    
    try {
      const pokemon = await this.pendingPromise;
      this.queue.push(pokemon);
      this.onStateChange?.({ state: 'ready', pokemon });
      return pokemon;
    } catch (error) {
      this.onStateChange?.({ 
        state: 'error', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
      throw error;
    } finally {
      this.generating = false;
      this.pendingPromise = null;
    }
  }
  
  /**
   * Actually perform the generation
   */
  private async doGenerate(): Promise<GeneratedPokemon> {
    const level = this.defaultLevel + Math.floor(Math.random() * 5) - 2;
    const actualLevel = Math.max(1, level);
    
    // Try API first, fall back to mock
    if (isApiAvailable()) {
      try {
        return await this.generateFromApi(actualLevel);
      } catch (error) {
        console.warn('API generation failed, falling back to mock:', error);
        return await this.generateFromMock(actualLevel);
      }
    } else {
      console.log('API not available, using mock generation');
      return await this.generateFromMock(actualLevel);
    }
  }
  
  /**
   * Generate using Gemini API
   */
  private async generateFromApi(level: number): Promise<GeneratedPokemon> {
    // Pick random types
    const type1 = getRandomTypeId();
    const type2 = Math.random() > 0.5 ? getRandomTypeId() : type1;
    const typeName = getTypeName(type1);
    
    console.log(`🤖 Generating AI Pokemon (${typeName}-type)...`);
    
    // Generate name
    const name = await generatePokemonName(typeName);
    console.log(`📛 Generated name: ${name}`);
    
    // Generate sprite image
    const spriteDataUrl = await generateSpriteImage(name, typeName);
    console.log(`🎨 Generated sprite image`);
    
    // Convert sprite to 2bpp
    const sprite2bpp = await this.spriteEncoder.encodeFromDataUrl(spriteDataUrl);
    console.log(`🔢 Encoded sprite to 2bpp (${sprite2bpp.length} bytes)`);
    
    // Generate stats
    const stats = generateRandomStats();
    
    // Pick random moves
    const shuffledMoves = [...MOVE_LIST].sort(() => Math.random() - 0.5);
    const moves = shuffledMoves.slice(0, 4);
    
    return {
      name,
      nameEncoded: encodeString(name),
      sprite2bpp,
      spriteDataUrl,
      types: [type1, type2],
      stats,
      baseStats: {
        hp: stats.hp,
        attack: stats.atk,
        defense: stats.def,
        speed: stats.spd,
        special: stats.spc,
      },
      moves,
      level,
    };
  }
  
  /**
   * Generate using mock data
   */
  private async generateFromMock(level: number): Promise<GeneratedPokemon> {
    const mock = generateMockPokemon();
    // Generate a dummy sprite image for the UI preview
    const spriteDataUrl = await mockGenerateImage(mock.name);
    
    return {
      name: mock.name.toUpperCase().slice(0, 10),
      nameEncoded: encodeString(mock.name.toUpperCase()),
      sprite2bpp: mock.sprite2bpp,
      spriteDataUrl,
      types: mock.types,
      stats: mock.baseStats,
      baseStats: {
        hp: mock.baseStats.hp,
        attack: mock.baseStats.atk,
        defense: mock.baseStats.def,
        speed: mock.baseStats.spd,
        special: mock.baseStats.spc,
      },
      moves: mock.moves,
      level,
    };
  }
}