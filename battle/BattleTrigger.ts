/**
 * BattleTrigger - Sets up game state to trigger battles directly
 * Based on pokered's TestBattle debug code
 */

import { EmulatorWrapper } from '../emulator/EmulatorWrapper';
import { WRAM, STATUS_FLAGS_7, MOVES, encodeString, PARTYMON_STRUCT } from '../emulator/MemoryMap';

/**
 * Create a player party mon struct in memory
 */
function buildPartyMon(options: {
  species: number;
  level: number;
  moves?: number[];
  hp?: number;
  maxHp?: number;
}): Uint8Array {
  const struct = new Uint8Array(PARTYMON_STRUCT.LENGTH);
  
  const { species, level, moves = [MOVES.TACKLE, 0, 0, 0] } = options;
  
  // Base stats for a typical pokemon (we'll use simple values)
  const baseHp = Math.floor(((level * 2) + 10 + level) * level / 100) + level + 10;
  const hp = options.hp ?? baseHp;
  const maxHp = options.maxHp ?? baseHp;
  
  // Species
  struct[PARTYMON_STRUCT.SPECIES] = species;
  
  // HP (2 bytes, big endian)
  struct[PARTYMON_STRUCT.HP] = (hp >> 8) & 0xFF;
  struct[PARTYMON_STRUCT.HP + 1] = hp & 0xFF;
  
  // Box level
  struct[PARTYMON_STRUCT.BOX_LEVEL] = level;
  
  // Status
  struct[PARTYMON_STRUCT.STATUS] = 0;
  
  // Types (placeholder - would need lookup table)
  struct[PARTYMON_STRUCT.TYPE1] = 0x00; // Normal
  struct[PARTYMON_STRUCT.TYPE2] = 0x00; // Normal
  
  // Catch rate (not important for battle)
  struct[PARTYMON_STRUCT.CATCH_RATE] = 45;
  
  // Moves (4 bytes)
  for (let i = 0; i < 4; i++) {
    struct[PARTYMON_STRUCT.MOVES + i] = moves[i] ?? 0;
  }
  
  // OT ID (2 bytes)
  struct[PARTYMON_STRUCT.OT_ID] = 0x01;
  struct[PARTYMON_STRUCT.OT_ID + 1] = 0x23;
  
  // EXP (3 bytes) - minimal exp
  struct[PARTYMON_STRUCT.EXP] = 0x00;
  struct[PARTYMON_STRUCT.EXP + 1] = 0x01;
  struct[PARTYMON_STRUCT.EXP + 2] = 0x00;
  
  // Stat EXP - all zeros for now
  // DVs - max DVs (15/15/15/15)
  struct[PARTYMON_STRUCT.DVS] = 0xFF;
  struct[PARTYMON_STRUCT.DVS + 1] = 0xFF;
  
  // PP (4 bytes) - full PP
  struct[PARTYMON_STRUCT.PP] = 35;
  struct[PARTYMON_STRUCT.PP + 1] = 35;
  struct[PARTYMON_STRUCT.PP + 2] = 35;
  struct[PARTYMON_STRUCT.PP + 3] = 35;
  
  // Level (again for battle struct)
  struct[PARTYMON_STRUCT.LEVEL] = level;
  
  // Max HP (2 bytes, big endian)
  struct[PARTYMON_STRUCT.MAX_HP] = (maxHp >> 8) & 0xFF;
  struct[PARTYMON_STRUCT.MAX_HP + 1] = maxHp & 0xFF;
  
  // Stats (2 bytes each) - simple calculation
  const atk = Math.floor(level * 0.5) + 10;
  const def = Math.floor(level * 0.4) + 10;
  const spd = Math.floor(level * 0.5) + 10;
  const spc = Math.floor(level * 0.5) + 10;
  
  struct[PARTYMON_STRUCT.ATK] = (atk >> 8) & 0xFF;
  struct[PARTYMON_STRUCT.ATK + 1] = atk & 0xFF;
  struct[PARTYMON_STRUCT.DEF] = (def >> 8) & 0xFF;
  struct[PARTYMON_STRUCT.DEF + 1] = def & 0xFF;
  struct[PARTYMON_STRUCT.SPD] = (spd >> 8) & 0xFF;
  struct[PARTYMON_STRUCT.SPD + 1] = spd & 0xFF;
  struct[PARTYMON_STRUCT.SPC] = (spc >> 8) & 0xFF;
  struct[PARTYMON_STRUCT.SPC + 1] = spc & 0xFF;
  
  return struct;
}

export interface BattleSetup {
  playerPokemon: {
    species: number;
    level: number;
    name?: string;
  };
  enemyPokemon: {
    species: number;
    level: number;
    name: string;
  };
}

/**
 * Set up game state for TestBattle mode
 * This mimics what pokered's TestBattle debug function does
 */
export function setupTestBattle(
  emulator: EmulatorWrapper,
  setup: BattleSetup
): void {

  
  // 1. Set Earth Badge for obedience (prevents level 100 pokemon from disobeying)
  emulator.writeMemory(WRAM.wObtainedBadges, 1 << 7); // BIT_EARTHBADGE
  
  // 2. Set TestBattle flag in status flags 7
  // const statusFlags7 = emulator.readMemory(WRAM.wStatusFlags7);
  // emulator.writeMemory(WRAM.wStatusFlags7, statusFlags7 | (1 << STATUS_FLAGS_7.BIT_TEST_BATTLE));
  
  // 3. Reset party - set count to 0, then terminator
  emulator.writeMemory(WRAM.wPartyCount, 0);
  emulator.writeMemory(WRAM.wPartySpecies, 0xFF); // Terminator
  
  // 4. Set up the player's Pokemon
  // First, write the party count
  emulator.writeMemory(WRAM.wPartyCount, 1);
  
  // Write species to party list
  emulator.writeMemory(WRAM.wPartySpecies, setup.playerPokemon.species);
  emulator.writeMemory(WRAM.wPartySpecies + 1, 0xFF); // Terminator
  
  // Create and write party mon struct
  const playerMon = buildPartyMon({
    species: setup.playerPokemon.species,
    level: setup.playerPokemon.level,
    moves: [MOVES.TACKLE, MOVES.SCRATCH, MOVES.QUICK_ATTACK, 0],
  });
  emulator.writeMemoryBlock(WRAM.wPartyMon1, playerMon);
  
  // Write player mon nickname
  const playerName = setup.playerPokemon.name ?? 'PLAYER';
  emulator.writeMemoryBlock(WRAM.wPartyMon1Nick, encodeString(playerName.toUpperCase()));
  
  // Write player mon OT name
  emulator.writeMemoryBlock(WRAM.wPartyMon1OT, encodeString('ASH'));
  
  // 5. Set current species/level for AddPartyMon
  // REMOVED: These writes cause side effects ($D127 is shared)
  // emulator.writeMemory(WRAM.wCurPartySpecies, setup.playerPokemon.species);
  // emulator.writeMemory(WRAM.wCurEnemyLevel, setup.playerPokemon.level);
  
  // 6. Set up the opponent
  // For a wild battle, wCurOpponent is the species
  emulator.writeMemory(WRAM.wCurOpponent, setup.enemyPokemon.species);
  emulator.writeMemory(WRAM.wEnemyMonSpecies2, setup.enemyPokemon.species);
  
  // Set enemy level
  // REMOVED: Managed by BattleController breakpoint to avoid overworld memory pollution
  // emulator.writeMemory(WRAM.wCurEnemyLevel, setup.enemyPokemon.level);
  
  // Write enemy nickname
  emulator.writeMemoryBlock(WRAM.wEnemyMonNick, encodeString(setup.enemyPokemon.name.toUpperCase()));
  

}

/**
 * Force trigger a wild battle by manipulating game state
 * This should be called when the game is in the overworld
 */
export function triggerWildBattle(
  emulator: EmulatorWrapper,
  enemySpecies: number,
  enemyLevel: number,
  enemyName: string
): void {

  
  // Set the enemy species
  emulator.writeMemory(WRAM.wCurOpponent, enemySpecies);
  emulator.writeMemory(WRAM.wEnemyMonSpecies2, enemySpecies);
  emulator.writeMemory(WRAM.wCurEnemyLevel, enemyLevel);
  
  // Write enemy nickname
  emulator.writeMemoryBlock(WRAM.wEnemyMonNick, encodeString(enemyName.toUpperCase()));
  
  // Set wIsInBattle to 1 (wild battle)
  emulator.writeMemory(WRAM.wIsInBattle, 1);
  
  // Set battle type to normal (0)
  emulator.writeMemory(WRAM.wBattleType, 0);
}

/**
 * Check if we're currently in a battle
 */
export function isInBattle(emulator: EmulatorWrapper): boolean {
  return emulator.readMemory(WRAM.wIsInBattle) !== 0;
}

/**
 * Get the battle result
 * 0 = win, 1 = lose, 2 = draw, 3 = ran
 */
export function getBattleResult(emulator: EmulatorWrapper): number {
  return emulator.readMemory(WRAM.wBattleResult);
}

/**
 * Check if the player's party has been initialized
 */
export function hasPlayerParty(emulator: EmulatorWrapper): boolean {
  return emulator.readMemory(WRAM.wPartyCount) > 0;
}
