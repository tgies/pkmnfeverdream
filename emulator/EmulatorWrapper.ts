/**
 * TypeScript wrapper for binjgb WASM emulator
 * Modified for AI Studio - loads binjgb dynamically
 */

// Types for the binjgb WASM module exports
interface BinjgbModule {
  _malloc(size: number): number;
  _free(ptr: number): void;
  
  // Emulator lifecycle
  _emulator_new_simple(
    romPtr: number,
    romSize: number,
    audioFreq: number,
    audioFrames: number,
    cgbColorCurve: number
  ): number;
  _emulator_delete(emu: number): void;
  
  // Execution
  _emulator_run_until_f64(emu: number, ticks: number): number;
  _emulator_get_ticks_f64(emu: number): number;
  
  // Memory access
  _emulator_read_mem(emu: number, addr: number): number;
  _emulator_write_mem(emu: number, addr: number, value: number): void;
  
  // Joypad
  _set_joyp_up(emu: number, pressed: number): void;
  _set_joyp_down(emu: number, pressed: number): void;
  _set_joyp_left(emu: number, pressed: number): void;
  _set_joyp_right(emu: number, pressed: number): void;
  _set_joyp_A(emu: number, pressed: number): void;
  _set_joyp_B(emu: number, pressed: number): void;
  _set_joyp_start(emu: number, pressed: number): void;
  _set_joyp_select(emu: number, pressed: number): void;
  
  // Frame buffer
  _get_frame_buffer_ptr(emu: number): number;
  _get_frame_buffer_size(emu: number): number;
  
  // Joypad buffer (for rewind)
  _joypad_new(): number;
  _joypad_delete(joypad: number): void;
  _emulator_set_default_joypad_callback(emu: number, joypad: number): void;
  
  // Memory views
  HEAPU8: Uint8Array;
  HEAPU32: Uint32Array;
}

// Cache for the loaded Binjgb factory
let binjgbFactory: (() => Promise<BinjgbModule>) | null = null;

/**
 * Load the Binjgb factory function dynamically
 */
async function loadBinjgb(): Promise<() => Promise<BinjgbModule>> {
  if (binjgbFactory) {
    return binjgbFactory;
  }

  // Check if already loaded via script tag
  if (typeof (window as any).Binjgb === 'function') {
    binjgbFactory = (window as any).Binjgb;
    return binjgbFactory!;
  }

  // Load dynamically by fetching and evaluating the script
  console.log('Loading binjgb.js dynamically...');
  
  const response = await fetch('./binjgb.js');
  const scriptText = await response.text();
  
  // Create a function that will execute the script and return Binjgb
  // The binjgb.js file creates a var Binjgb at the end
  const loadScript = new Function(`
    ${scriptText}
    return Binjgb;
  `);
  
  const BinjgbRaw = loadScript();
  
  // Wrap it with our locateFile config
  binjgbFactory = () => {
    return BinjgbRaw({
      locateFile: (path: string) => './' + path
    });
  };
  
  // Also put on window for debugging
  (window as any).Binjgb = binjgbFactory;
  
  return binjgbFactory;
}

export interface JoypadState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  a: boolean;
  b: boolean;
  start: boolean;
  select: boolean;
}

const TICKS_PER_FRAME = 70224; // ~59.7 FPS
const AUDIO_FREQUENCY = 44100;
const AUDIO_FRAMES = 2048;

export class EmulatorWrapper {
  private module: BinjgbModule | null = null;
  private emulator: number = 0;
  private joypadBuffer: number = 0;
  private romPtr: number = 0;
  private frameBuffer: Uint8Array | null = null;
  private currentTicks: number = 0;
  
  /**
   * Initialize the emulator with a ROM
   */
  async init(romData: Uint8Array): Promise<void> {
    // Load Binjgb factory dynamically
    const BinjgbFactory = await loadBinjgb();
    
    // Call factory function to get the module instance
    this.module = await BinjgbFactory();
    
    // Allocate memory for ROM
    this.romPtr = this.module._malloc(romData.length);
    this.module.HEAPU8.set(romData, this.romPtr);
    
    // Create emulator instance
    this.emulator = this.module._emulator_new_simple(
      this.romPtr,
      romData.length,
      AUDIO_FREQUENCY,
      AUDIO_FRAMES,
      0 // CGB color curve: none
    );
    
    if (!this.emulator) {
      throw new Error('Failed to create emulator');
    }
    
    // Set up joypad
    this.joypadBuffer = this.module._joypad_new();
    this.module._emulator_set_default_joypad_callback(this.emulator, this.joypadBuffer);
    
    // Get frame buffer reference
    const fbPtr = this.module._get_frame_buffer_ptr(this.emulator);
    const fbSize = this.module._get_frame_buffer_size(this.emulator);
    this.frameBuffer = new Uint8Array(this.module.HEAPU8.buffer, fbPtr, fbSize);
  }
  
  /**
   * Run the emulator for one frame
   */
  runFrame(): void {
    if (!this.module || !this.emulator) return;
    
    this.currentTicks += TICKS_PER_FRAME;
    this.module._emulator_run_until_f64(this.emulator, this.currentTicks);
  }
  
  /**
   * Get the current frame buffer as RGBA data
   */
  getFrameBuffer(): Uint8Array | null {
    return this.frameBuffer;
  }
  
  /**
   * Read a byte from memory
   */
  readMemory(addr: number): number {
    if (!this.module || !this.emulator) return 0;
    return this.module._emulator_read_mem(this.emulator, addr);
  }
  
  /**
   * Write a byte to memory
   */
  writeMemory(addr: number, value: number): void {
    if (!this.module || !this.emulator) return;
    this.module._emulator_write_mem(this.emulator, addr, value);
  }
  
  /**
   * Write multiple bytes to memory
   */
  writeMemoryBlock(startAddr: number, data: Uint8Array): void {
    for (let i = 0; i < data.length; i++) {
      this.writeMemory(startAddr + i, data[i]);
    }
  }
  
  /**
   * Read multiple bytes from memory
   */
  readMemoryBlock(startAddr: number, length: number): Uint8Array {
    const data = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = this.readMemory(startAddr + i);
    }
    return data;
  }
  
  /**
   * Set joypad button states
   */
  setJoypad(state: Partial<JoypadState>): void {
    if (!this.module || !this.emulator) return;
    
    if (state.up !== undefined) this.module._set_joyp_up(this.emulator, state.up ? 1 : 0);
    if (state.down !== undefined) this.module._set_joyp_down(this.emulator, state.down ? 1 : 0);
    if (state.left !== undefined) this.module._set_joyp_left(this.emulator, state.left ? 1 : 0);
    if (state.right !== undefined) this.module._set_joyp_right(this.emulator, state.right ? 1 : 0);
    if (state.a !== undefined) this.module._set_joyp_A(this.emulator, state.a ? 1 : 0);
    if (state.b !== undefined) this.module._set_joyp_B(this.emulator, state.b ? 1 : 0);
    if (state.start !== undefined) this.module._set_joyp_start(this.emulator, state.start ? 1 : 0);
    if (state.select !== undefined) this.module._set_joyp_select(this.emulator, state.select ? 1 : 0);
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.module) {
      if (this.joypadBuffer) this.module._joypad_delete(this.joypadBuffer);
      if (this.emulator) this.module._emulator_delete(this.emulator);
      if (this.romPtr) this.module._free(this.romPtr);
    }
    this.emulator = 0;
    this.joypadBuffer = 0;
    this.romPtr = 0;
    this.frameBuffer = null;
  }
}
