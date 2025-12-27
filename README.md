# AI Pokemon Battles

Infinite Pokemon battles with AI-generated Pokemon using Gemini, running in a Game Boy emulator.

## Features

- 🎮 Full Pokemon Red running in browser via WebAssembly emulator
- 🤖 AI-generated Pokemon names using Gemini 2.0 Flash
- 🎨 AI-generated 56x56 grayscale sprites using Gemini Image Generation
- 🔄 Pre-fetch queue generates next Pokemon during current battle
- ⏳ Automatic pause overlay when generation is pending

## Controls

- **Arrow keys**: Move
- **Z**: B button
- **X**: A button
- **Enter**: Start
- **Right Shift**: Select

## How It Works

1. On startup, generates the first AI Pokemon
2. When a battle starts, immediately begins generating the NEXT Pokemon
3. After battle ends, uses pre-generated Pokemon if ready
4. If generation is still pending, pauses game and shows overlay
5. Repeat infinitely!

## Files

- `index.html` - Main HTML with import maps
- `index.tsx` - Entry point
- `services/gemini.ts` - Gemini API integration
- `services/PokemonGenerationService.ts` - Pre-fetch queue
- `emulator/` - Game Boy emulator wrapper
- `battle/` - Battle detection and injection
- `graphics/SpriteEncoder.ts` - PNG to 2bpp conversion
- `binjgb.js` / `binjgb.wasm` - WebAssembly Game Boy emulator
- `pokered.gbc` - Pokemon Red ROM
