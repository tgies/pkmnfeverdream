/**
 * Memory map for Pokemon Red WRAM addresses
 * Values derived from pokered/pokered.sym
 */

// Key WRAM addresses from pokered.sym
export const WRAM = {
  // Current enemy move data
  wEnemyMoveNum: 0xCFCC,
  wEnemyMoveEffect: 0xCFCD,
  wEnemyMovePower: 0xCFCE,
  wEnemyMoveType: 0xCFCF,
  wEnemyMoveAccuracy: 0xCFD0,
  wEnemyMoveMaxPP: 0xCFD1,
  
  // Current player move data
  wPlayerMoveNum: 0xCFD2,
  wPlayerMoveEffect: 0xCFD3,
  wPlayerMovePower: 0xCFD4,
  wPlayerMoveType: 0xCFD5,
  wPlayerMoveAccuracy: 0xCFD6,
  wPlayerMoveMaxPP: 0xCFD7,
  
  // Enemy Pokemon species
  wEnemyMonSpecies2: 0xCFD8,
  wBattleMonSpecies2: 0xCFD9,
  
  // Enemy Pokemon nickname (11 bytes)
  wEnemyMonNick: 0xCFDA,
  
  // Enemy mon battle struct
  wEnemyMon: 0xCFE5,
  wEnemyMonSpecies: 0xCFE5,
  wEnemyMonHP: 0xCFE6,
  wEnemyMonLevel: 0xCFF3,
  wEnemyMonMoves: 0xCFED,
  
  // Enemy base stats (5 bytes)
  wEnemyMonBaseStats: 0xD002,
  wEnemyMonActualCatchRate: 0xD007,
  wEnemyMonBaseExp: 0xD008,
  
  // Player's battle mon
  wBattleMonNick: 0xD009,
  wBattleMon: 0xD014,
  wBattleMonLevel: 0xD022,
  
  // Trainer class
  wTrainerClass: 0xD031,
  
  // Battle state (from pokered.sym)
  wIsInBattle: 0xD057,      // 0=no, 1=wild, 2=trainer
  wCurOpponent: 0xD059,     // Current opponent (species for wild, trainer class+200 for trainer)
  wBattleType: 0xD05A,      // 0=normal, 1=old man, 2=safari
  
  // Battle result
  wBattleResult: 0xCF0B,    // 0=win, 1=lose, 2=draw, 3=ran
  
  // Player party
  wPlayerName: 0xD158,      // 11 bytes
  wPartyCount: 0xD163,
  wPartySpecies: 0xD164,    // 7 bytes (6 pokemon + terminator)
  wPartyMon1: 0xD16B,       // First party pokemon struct
  wPartyMon1Species: 0xD16B,
  wPartyMon1HP: 0xD16C,
  wPartyMon1Level: 0xD18C,
  wPartyMon1Moves: 0xD173,
  
  // Party mon nicknames (6 x 11 bytes each)
  wPartyMon1Nick: 0xD2B5,
  
  // Party mon OT names (6 x 11 bytes each)
  wPartyMon1OT: 0xD273,
  
  // Game state flags (from pokered.sym)
  wStatusFlags7: 0xD733,    // Bit 0 = TEST_BATTLE mode
  wObtainedBadges: 0xD72A,  // Badges for obedience
  
  // Current species/level being loaded
  wCurPartySpecies: 0xCF91,
  wCurEnemyLevel: 0xD127,
  wMonDataLocation: 0xCC49,
  wCurMap: 0xD35E,
} as const;

// Status flags 7 bits
export const STATUS_FLAGS_7 = {
  BIT_TEST_BATTLE: 0,
} as const;

// Pokemon species IDs (from pokered constants/pokemon_constants.asm)
export const POKEMON = {
  NONE: 0x00,
  RHYDON: 0x01,
  KANGASKHAN: 0x02,
  NIDORAN_M: 0x03,
  CLEFAIRY: 0x04,
  SPEAROW: 0x05,
  VOLTORB: 0x06,
  NIDOKING: 0x07,
  SLOWBRO: 0x08,
  IVYSAUR: 0x09,
  EXEGGUTOR: 0x0A,
  MEW: 0x15,
  PIKACHU: 0x54,
  BULBASAUR: 0x99,
  CHARMANDER: 0xB0,
  SQUIRTLE: 0xB1,
} as const;

// Pokemon types
export const TYPES = {
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
} as const;

// Move IDs (from pokered data/moves/moves.asm)
export const MOVES = {
  NONE: 0x00,
  POUND: 0x01,
  KARATE_CHOP: 0x02,
  DOUBLE_SLAP: 0x03,
  COMET_PUNCH: 0x04,
  MEGA_PUNCH: 0x05,
  PAY_DAY: 0x06,
  FIRE_PUNCH: 0x07,
  ICE_PUNCH: 0x08,
  THUNDER_PUNCH: 0x09,
  SCRATCH: 0x0A,
  TACKLE: 0x21,
  EMBER: 0x34,
  WATER_GUN: 0x37,
  VINE_WHIP: 0x16,
  THUNDERSHOCK: 0x54,
  QUICK_ATTACK: 0x62,
  BITE: 0x2C,
} as const;

// Pokemon name character encoding (from pokered charmap.asm)
export const CHARMAP: Record<string, number> = {
  // Uppercase letters
  'A': 0x80, 'B': 0x81, 'C': 0x82, 'D': 0x83, 'E': 0x84, 'F': 0x85,
  'G': 0x86, 'H': 0x87, 'I': 0x88, 'J': 0x89, 'K': 0x8A, 'L': 0x8B,
  'M': 0x8C, 'N': 0x8D, 'O': 0x8E, 'P': 0x8F, 'Q': 0x90, 'R': 0x91,
  'S': 0x92, 'T': 0x93, 'U': 0x94, 'V': 0x95, 'W': 0x96, 'X': 0x97,
  'Y': 0x98, 'Z': 0x99,
  // Lowercase letters
  'a': 0xA0, 'b': 0xA1, 'c': 0xA2, 'd': 0xA3, 'e': 0xA4, 'f': 0xA5,
  'g': 0xA6, 'h': 0xA7, 'i': 0xA8, 'j': 0xA9, 'k': 0xAA, 'l': 0xAB,
  'm': 0xAC, 'n': 0xAD, 'o': 0xAE, 'p': 0xAF, 'q': 0xB0, 'r': 0xB1,
  's': 0xB2, 't': 0xB3, 'u': 0xB4, 'v': 0xB5, 'w': 0xB6, 'x': 0xB7,
  'y': 0xB8, 'z': 0xB9,
  // Numbers
  '0': 0xF6, '1': 0xF7, '2': 0xF8, '3': 0xF9, '4': 0xFA,
  '5': 0xFB, '6': 0xFC, '7': 0xFD, '8': 0xFE, '9': 0xFF,
  // Special
  ' ': 0x7F,
  '@': 0x50, // String terminator
};

export const NAME_LENGTH = 11; // Including terminator

/**
 * Encode a string to Pokemon Red's character format
 */
export function encodeString(str: string, maxLen: number = NAME_LENGTH): Uint8Array {
  const result = new Uint8Array(maxLen);
  const chars = str.slice(0, maxLen - 1); // Leave room for terminator
  
  for (let i = 0; i < chars.length; i++) {
    result[i] = CHARMAP[chars[i]] ?? 0x7F; // Default to space
  }
  result[chars.length] = 0x50; // String terminator
  
  return result;
}

// Party mon struct layout
export const PARTYMON_STRUCT = {
  SPECIES: 0,      // 1 byte
  HP: 1,           // 2 bytes
  BOX_LEVEL: 3,    // 1 byte
  STATUS: 4,       // 1 byte
  TYPE1: 5,        // 1 byte
  TYPE2: 6,        // 1 byte
  CATCH_RATE: 7,   // 1 byte
  MOVES: 8,        // 4 bytes
  OT_ID: 12,       // 2 bytes
  EXP: 14,         // 3 bytes
  HP_EXP: 17,      // 2 bytes
  ATK_EXP: 19,     // 2 bytes
  DEF_EXP: 21,     // 2 bytes
  SPD_EXP: 23,     // 2 bytes
  SPC_EXP: 25,     // 2 bytes
  DVS: 27,         // 2 bytes (IVs)
  PP: 29,          // 4 bytes
  LEVEL: 33,       // 1 byte
  MAX_HP: 34,      // 2 bytes
  ATK: 36,         // 2 bytes
  DEF: 38,         // 2 bytes
  SPD: 40,         // 2 bytes
  SPC: 42,         // 2 bytes
  LENGTH: 44,      // Total struct length
} as const;

// Enemy battle struct layout (same structure)
export const BATTLE_STRUCT = PARTYMON_STRUCT;
