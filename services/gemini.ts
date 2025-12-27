/**
 * Gemini API Service
 * Follows the ai-studio-template pattern for AI Studio compatibility
 */

import { GoogleGenAI, ThinkingLevel } from "@google/genai";

// Initialize the API client - AI Studio provides process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Pokemon type names for prompt generation
 */
const TYPE_NAMES: Record<number, string> = {
  0x00: 'Normal',
  0x01: 'Fighting',
  0x02: 'Flying',
  0x03: 'Poison',
  0x04: 'Ground',
  0x05: 'Rock',
  0x07: 'Bug',
  0x08: 'Ghost',
  0x14: 'Fire',
  0x15: 'Water',
  0x16: 'Grass',
  0x17: 'Electric',
  0x18: 'Psychic',
  0x19: 'Ice',
  0x1A: 'Dragon',
};

/**
 * Get type name from type ID
 */
export function getTypeName(typeId: number): string {
  return TYPE_NAMES[typeId] ?? 'Normal';
}

// Check if API is available (always true in AI Studio)
export function isApiAvailable(): boolean {
  return true;
}

/**
 * Generates a Pokemon name using the Gemini text model.
 */
export async function generatePokemonName(primaryType: string): Promise<string> {
  try {
    const prompt = `Generate a single creative Pokemon-style name for a ${primaryType}-type creature. 
The name should be:
- 3-10 characters long
- Easy to pronounce
- Sound like it could be a real Pokemon name
- Not be an existing Pokemon name

Reply with ONLY the name, nothing else.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL,
        },
      },
    });

    const name = response.text?.trim().toUpperCase().slice(0, 10) || 'UNKNOWN';
    // Remove any non-alphanumeric characters
    return name.replace(/[^A-Z]/g, '').slice(0, 10);
  } catch (error) {
    console.error("Name generation error:", error);
    throw error;
  }
}

/**
 * Generates a Pokemon sprite image using the Gemini image model.
 * Returns a base64 data URL.
 * Uses the same pattern as the ai-studio-template.
 */
export async function generateSpriteImage(name: string, primaryType: string): Promise<string> {
  try {
    const prompt = `A simple 2-bit grayscale front battle sprite for a Pokemon Red/Blue ${primaryType}-type Pokemon named ${name}. No text, white background. Low detail, low resolution (56x56).`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image', // Same as ai-studio-template
      contents: prompt,
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
    });

    // Iterate through parts to find the image
    const parts = response.candidates?.[0]?.content?.parts;

    if (parts) {
      for (const part of parts as any[]) {
        if (part.inlineData && part.inlineData.data) {
          // Construct the data URL
          return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image data found in response.");
  } catch (error) {
    console.error("Image generation error:", error);
    throw error;
  }
}

/**
 * Generate random base stats for a Pokemon (60-100 range)
 */
export function generateRandomStats(): {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  spc: number;
} {
  const randomStat = () => Math.floor(Math.random() * 40) + 60;
  return {
    hp: randomStat(),
    atk: randomStat(),
    def: randomStat(),
    spd: randomStat(),
    spc: randomStat(),
  };
}

/**
 * Get a random type ID
 */
export function getRandomTypeId(): number {
  const typeIds = Object.keys(TYPE_NAMES).map(Number);
  return typeIds[Math.floor(Math.random() * typeIds.length)];
}
