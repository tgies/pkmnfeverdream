/**
 * Mock Gemini service for local development without API calls
 */

// Pre-generated names that sound like Pokemon
const MOCK_NAMES = [
  'Flamorb',
  'Aqualing',
  'Zappix',
  'Thornpaw',
  'Frostling',
  'Shadowfin',
  'Boulderox',
  'Windweave',
  'Crystalix',
  'Emberfang',
];



// Generate a simple mock sprite pattern (checkerboard-ish)
function generateMockSpriteData(): Uint8Array {
  // 56x56 pixels = 7x7 tiles, each tile is 8x8 = 16 bytes
  const tileCount = 7 * 7;
  const bytesPerTile = 16;
  const data = new Uint8Array(tileCount * bytesPerTile);
  
  // Create a simple pattern
  for (let tile = 0; tile < tileCount; tile++) {
    const row = Math.floor(tile / 7);
    const col = tile % 7;
    const isCenter = row >= 2 && row <= 4 && col >= 2 && col <= 4;
    
    for (let line = 0; line < 8; line++) {
      // 2bpp format: low bit plane, then high bit plane
      const baseIdx = tile * bytesPerTile + line * 2;
      
      if (isCenter) {
        // Darker pattern for center
        data[baseIdx] = 0xFF;     // Low plane
        data[baseIdx + 1] = 0xFF; // High plane
      } else {
        // Lighter pattern for edges
        data[baseIdx] = ((line + col) % 2) ? 0xAA : 0x55;
        data[baseIdx + 1] = 0x00;
      }
    }
  }
  
  return data;
}

export interface MockPokemonData {
  name: string;
  sprite2bpp: Uint8Array;
  types: [number, number];
  baseStats: {
    hp: number;
    atk: number;
    def: number;
    spd: number;
    spc: number;
  };
  moves: number[];
}

// Pokemon types (from pokered constants)
const TYPES = {
  NORMAL: 0x00,
  FIGHTING: 0x01,
  FLYING: 0x02,
  POISON: 0x03,
  GROUND: 0x04,
  ROCK: 0x05,
  BUG: 0x07,
  GHOST: 0x08,
  FIRE: 0x14,
  WATER: 0x15,
  GRASS: 0x16,
  ELECTRIC: 0x17,
  PSYCHIC: 0x18,
  ICE: 0x19,
  DRAGON: 0x1A,
};

// Some common moves (from pokered move_constants.asm)
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

const TYPE_LIST = Object.values(TYPES);
const MOVE_LIST = Object.values(MOVES);

let mockIndex = 0;

/**
 * Generate a mock Pokemon for testing
 */
export function generateMockPokemon(): MockPokemonData {
  const name = MOCK_NAMES[mockIndex % MOCK_NAMES.length];
  mockIndex++;
  
  // Random types
  const type1 = TYPE_LIST[Math.floor(Math.random() * TYPE_LIST.length)];
  const type2 = Math.random() > 0.5 ? TYPE_LIST[Math.floor(Math.random() * TYPE_LIST.length)] : type1;
  
  // Random stats (60-100 range for balanced mock)
  const randomStat = () => Math.floor(Math.random() * 40) + 60;
  
  // Pick 4 random moves
  const shuffledMoves = [...MOVE_LIST].sort(() => Math.random() - 0.5);
  const moves = shuffledMoves.slice(0, 4);
  
  return {
    name,
    sprite2bpp: generateMockSpriteData(),
    types: [type1, type2],
    baseStats: {
      hp: randomStat(),
      atk: randomStat(),
      def: randomStat(),
      spd: randomStat(),
      spc: randomStat(),
    },
    moves,
  };
}

/**
 * Mock text generation (for name generation)
 */
export async function mockGenerateText(_prompt: string): Promise<string> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return MOCK_NAMES[mockIndex++ % MOCK_NAMES.length];
}

/**
 * Mock image generation
 */
export async function mockGenerateImage(_prompt: string): Promise<string> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Return a data URL with a simple 56x56 gradient
  const canvas = document.createElement('canvas');
  canvas.width = 56;
  canvas.height = 56;
  const ctx = canvas.getContext('2d')!;
  
  // Create a simple gradient
  const gradient = ctx.createLinearGradient(0, 0, 56, 56);
  gradient.addColorStop(0, '#000');
  gradient.addColorStop(0.33, '#555');
  gradient.addColorStop(0.66, '#AAA');
  gradient.addColorStop(1, '#FFF');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 56, 56);
  
  // Add a simple shape
  ctx.fillStyle = '#FFF';
  ctx.beginPath();
  ctx.arc(28, 28, 20, 0, Math.PI * 2);
  ctx.fill();
  
  return canvas.toDataURL('image/png');
}

export const USE_MOCK = (import.meta as any).env?.VITE_USE_MOCK !== 'false';
