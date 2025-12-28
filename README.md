# pokemon_feverdream

Battle infinite Pokemon, never know peace.

This app generates Pokemon front sprites and names with Gemini models, then injects them into the running game's memory so you can battle them.

## instructions

Wait for generation. Click game to focus input. ENTER at title, arrow keys, X to select.

## how does it work?

We use [binjgb](https://github.com/nickshanks/binjgb), an emulator that lets us read and write Game Boy memory at runtime.

We rely on [pokered](https://github.com/pret/pokered), a reconstruction of Pokemon Red source code. It reveals memory addresses for sprite data and names, plus helps us build a [modified ROM](https://github.com/tgies/pokered/tree/pkmnfeverdream) that boots straight to battle.

We set a breakpoint on the "load front sprite" function. When the game is about to execute it, we inject our sprite (converted to Game Boy format) and name, then skip the game's loading code.

## building

We depend on:

- [patched pokered](https://github.com/tgies/pokered/tree/pkmnfeverdream)
- [binjgb](https://github.com/nickshanks/binjgb) built with `RGBDS_LIVE` to enable breakpoint support, and with a weird stub injected in `binjgb.js` to keep it happy outside of the intended rgbds live environment

`make` (or `make rom`, `make emulator`) will build these, using Docker for the rgbds and emscripten build environments. If you'd rather use local tools, you can change the `Makefile` to use your local rgbds and emscripten.

`build-rom.sh` and `build-emulator.sh` are nominally the same logic as the `Makefile` duplicated for absolutely no reason.

`npm`/`vite` stuff should work, but it's not really maintained; we primarily target AI Studio.

## deploying to ai studio

This can run in Google AI Studio "Build" mode, taking advantage of free Gemini usage there. We need to package it specifically to work there.

To create a suitable "empty" AI Studio project, just enter "write an absolutely minimal Hello World" as a prompt or something.

To deploy:

1. Run `make dist` _or_ `./package_dist.sh` (should do the same thing)
2. This creates a timestamped zip file (e.g., `dist_20251227_120000.zip`)
3. Upload this zip directly to AI Studio with the "Upload zip" option on an existing project.

The script handles the necessary cleanup:

- Strips `node_modules`, `.git`, and `vendor` source
- Copies everything else "unbuilt" (AI Studio handles at runtime)
- Includes the built `binjgb.{js,wasm}` and patched `pokered.gbc`
- Includes `metadata.json` which is required to request camera permissions for the Game Boy Camera feature

# todo

- fix stats etc
- move set injection
- it's perhaps possible to do this without a patched ROM (runtime hot-patching)
