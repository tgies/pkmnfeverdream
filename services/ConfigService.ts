/**
 * ConfigService - Centralized configuration for Pokemon generation
 * Manages prompt templates and 2bpp conversion thresholds
 */

export interface ThresholdConfig {
  black: number;    // brightness < black = color 3 (black)
  darkGray: number; // brightness < darkGray = color 2 (dark gray)
  lightGray: number; // brightness < lightGray = color 1 (light gray)
  // brightness >= lightGray = color 0 (white)
}

export interface ConfigState {
  namePromptTemplate: string;
  imagePromptTemplate: string;
  cameraPromptTemplate: string;
  thresholds: ThresholdConfig;
  nameTemperature: number;
  darknessExponent: number;
}

export type ConfigChangeListener = (config: ConfigState) => void;

const DEFAULT_NAME_PROMPT = `Make up a single creative and original Pokemon-style name for a {type}-type creature.
The name should:
- Be 3-10 characters long
- Sound like it could be a real Pokemon name
- Not be an existing Pokemon name

Reply with ONLY the name, nothing else.`;

const DEFAULT_IMAGE_PROMPT = `A simple 2-bit grayscale front battle sprite for a Pokemon Red/Blue {type}-type Pokemon named {name}. No text, white background. Low detail, low resolution (56x56).`;

const DEFAULT_CAMERA_PROMPT = `Transform this photo into a simple 2-bit grayscale Pokemon Red/Blue front battle sprite.
The sprite should be 56x56 pixels, low detail, white background, no text.
Capture the essence and mood of the subject as a {type}-type Pokemon named {name}.`;

const DEFAULT_THRESHOLDS: ThresholdConfig = {
  black: 64,
  darkGray: 128,
  lightGray: 224,
};

const DEFAULT_NAME_TEMPERATURE = 1.5;
const DEFAULT_DARKNESS_EXPONENT = 0.6;

/**
 * Singleton configuration service
 */
class ConfigServiceClass {
  private state: ConfigState;
  private listeners: Set<ConfigChangeListener> = new Set();

  constructor() {
    this.state = {
      namePromptTemplate: DEFAULT_NAME_PROMPT,
      imagePromptTemplate: DEFAULT_IMAGE_PROMPT,
      cameraPromptTemplate: DEFAULT_CAMERA_PROMPT,
      thresholds: { ...DEFAULT_THRESHOLDS },
      nameTemperature: DEFAULT_NAME_TEMPERATURE,
      darknessExponent: DEFAULT_DARKNESS_EXPONENT,
    };
  }

  /**
   * Get current configuration state
   */
  getState(): Readonly<ConfigState> {
    return this.state;
  }

  /**
   * Get the name prompt with type placeholder replaced
   */
  getNamePrompt(type: string): string {
    return this.state.namePromptTemplate.replace(/\{type\}/g, type);
  }

  /**
   * Get the image prompt with placeholders replaced
   */
  getImagePrompt(name: string, type: string): string {
    return this.state.imagePromptTemplate
      .replace(/\{name\}/g, name)
      .replace(/\{type\}/g, type);
  }

  /**
   * Get the camera transformation prompt with placeholders replaced
   */
  getCameraPrompt(name: string, type: string): string {
    return this.state.cameraPromptTemplate
      .replace(/\{name\}/g, name)
      .replace(/\{type\}/g, type);
  }

  /**
   * Get current thresholds
   */
  getThresholds(): Readonly<ThresholdConfig> {
    return this.state.thresholds;
  }

  /**
   * Get name generation temperature
   */
  getNameTemperature(): number {
    return this.state.nameTemperature;
  }

  /**
   * Set name generation temperature
   */
  setNameTemperature(temperature: number): void {
    this.state.nameTemperature = temperature;
    this.notifyListeners();
  }

  /**
   * Get darkness exponent for resampling
   */
  getDarknessExponent(): number {
    return this.state.darknessExponent;
  }

  /**
   * Set darkness exponent for resampling
   */
  setDarknessExponent(exponent: number): void {
    this.state.darknessExponent = exponent;
    this.notifyListeners();
  }

  /**
   * Get default darkness exponent
   */
  getDefaultDarknessExponent(): number {
    return DEFAULT_DARKNESS_EXPONENT;
  }

  /**
   * Get default name temperature
   */
  getDefaultNameTemperature(): number {
    return DEFAULT_NAME_TEMPERATURE;
  }

  /**
   * Update name prompt template
   */
  setNamePromptTemplate(template: string): void {
    this.state.namePromptTemplate = template;
    this.notifyListeners();
  }

  /**
   * Update image prompt template
   */
  setImagePromptTemplate(template: string): void {
    this.state.imagePromptTemplate = template;
    this.notifyListeners();
  }

  /**
   * Update camera prompt template
   */
  setCameraPromptTemplate(template: string): void {
    this.state.cameraPromptTemplate = template;
    this.notifyListeners();
  }

  /**
   * Update thresholds
   */
  setThresholds(thresholds: Partial<ThresholdConfig>): void {
    this.state.thresholds = { ...this.state.thresholds, ...thresholds };
    this.notifyListeners();
  }

  /**
   * Get the default name prompt template
   */
  getDefaultNamePrompt(): string {
    return DEFAULT_NAME_PROMPT;
  }

  /**
   * Get the default image prompt template
   */
  getDefaultImagePrompt(): string {
    return DEFAULT_IMAGE_PROMPT;
  }

  /**
   * Get the default camera prompt template
   */
  getDefaultCameraPrompt(): string {
    return DEFAULT_CAMERA_PROMPT;
  }

  /**
   * Reset name prompt to default
   */
  resetNamePrompt(): string {
    this.state.namePromptTemplate = DEFAULT_NAME_PROMPT;
    this.notifyListeners();
    return DEFAULT_NAME_PROMPT;
  }

  /**
   * Reset image prompt to default
   */
  resetImagePrompt(): string {
    this.state.imagePromptTemplate = DEFAULT_IMAGE_PROMPT;
    this.notifyListeners();
    return DEFAULT_IMAGE_PROMPT;
  }

  /**
   * Reset camera prompt to default
   */
  resetCameraPrompt(): string {
    this.state.cameraPromptTemplate = DEFAULT_CAMERA_PROMPT;
    this.notifyListeners();
    return DEFAULT_CAMERA_PROMPT;
  }

  /**
   * Reset to defaults
   */
  resetToDefaults(): void {
    this.state = {
      namePromptTemplate: DEFAULT_NAME_PROMPT,
      imagePromptTemplate: DEFAULT_IMAGE_PROMPT,
      cameraPromptTemplate: DEFAULT_CAMERA_PROMPT,
      thresholds: { ...DEFAULT_THRESHOLDS },
      nameTemperature: DEFAULT_NAME_TEMPERATURE,
      darknessExponent: DEFAULT_DARKNESS_EXPONENT,
    };
    this.notifyListeners();
  }

  /**
   * Subscribe to configuration changes
   */
  subscribe(listener: ConfigChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

// Export singleton instance
export const ConfigService = new ConfigServiceClass();
