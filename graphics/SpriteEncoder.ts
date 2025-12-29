/**
 * SpriteEncoder - Converts images to Game Boy 2bpp format
 */

import { ConfigService, ThresholdConfig } from '../services/ConfigService';

export class SpriteEncoder {
  private static readonly WIDTH = 56;
  private static readonly HEIGHT = 56;
  private static readonly TILE_SIZE = 8;
  
  /**
   * Load an image from a URL and convert it to GB 2bpp format
   */
  async encode(imageUrl: string): Promise<Uint8Array> {
    const img = await this.loadImage(imageUrl);
    return this.encodeFromImage(img);
  }
  
  /**
   * Load an image from a data URL (base64) and convert it to GB 2bpp format
   */
  async encodeFromDataUrl(dataUrl: string): Promise<Uint8Array> {
    const img = await this.loadImage(dataUrl);
    return this.encodeFromImage(img);
  }
  
  /**
   * Encode an HTMLImageElement to GB 2bpp format
   */
  private encodeFromImage(img: HTMLImageElement, thresholds?: ThresholdConfig): Uint8Array {
    const imageData = this.processImage(img);
    const effectiveThresholds = thresholds ?? ConfigService.getThresholds();
    const pixels = this.quantize(imageData, effectiveThresholds);
    return this.encode2bpp(pixels);
  }

  /**
   * Generate a preview ImageData showing how the image will look quantized
   * Returns a 56x56 ImageData in grayscale
   */
  async generatePreview(dataUrl: string, thresholds?: ThresholdConfig): Promise<ImageData> {
    const img = await this.loadImage(dataUrl);
    const imageData = this.processImage(img);
    const effectiveThresholds = thresholds ?? ConfigService.getThresholds();
    const pixels = this.quantize(imageData, effectiveThresholds);
    return this.pixelsToImageData(pixels);
  }

  /**
   * Convert quantized pixels (0-3) to grayscale ImageData for preview
   */
  private pixelsToImageData(pixels: Uint8Array): ImageData {
    const imageData = new ImageData(SpriteEncoder.WIDTH, SpriteEncoder.HEIGHT);
    const colorMap = [255, 170, 85, 0]; // 0=white, 1=light gray, 2=dark gray, 3=black
    
    for (let i = 0; i < pixels.length; i++) {
      const gray = colorMap[pixels[i]];
      imageData.data[i * 4] = gray;     // R
      imageData.data[i * 4 + 1] = gray; // G
      imageData.data[i * 4 + 2] = gray; // B
      imageData.data[i * 4 + 3] = 255;  // A
    }
    
    return imageData;
  }

  /**
   * Auto-crop and scale image to fit 56x56
   */
  private processImage(img: HTMLImageElement): ImageData {
    // 1. Draw original image to canvas to read pixels
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = img.width;
    srcCanvas.height = img.height;
    const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
    if (!srcCtx) throw new Error('Could not get 2d context');
    
    srcCtx.drawImage(img, 0, 0);
    const srcData = srcCtx.getImageData(0, 0, img.width, img.height);
    
    // 2. Find bounding box of content
    const bounds = this.findContentBounds(srcData);
    
    // 3. Create destination 56x56 canvas
    const destCanvas = document.createElement('canvas');
    destCanvas.width = SpriteEncoder.WIDTH;
    destCanvas.height = SpriteEncoder.HEIGHT;
    const destCtx = destCanvas.getContext('2d');
    if (!destCtx) throw new Error('Could not get 2d context');
    
    // Fill with white background
    destCtx.fillStyle = '#FFFFFF';
    destCtx.fillRect(0, 0, SpriteEncoder.WIDTH, SpriteEncoder.HEIGHT);
    
    if (bounds) {
      const width = bounds.maxX - bounds.minX + 1;
      const height = bounds.maxY - bounds.minY + 1;
      
      // Calculate scale to fit 56x56 maintaining aspect ratio
      const scale = Math.min(
        SpriteEncoder.WIDTH / width,
        SpriteEncoder.HEIGHT / height
      );
      
      const finalWidth = Math.floor(width * scale);
      const finalHeight = Math.floor(height * scale);
      
      const dx = Math.floor((SpriteEncoder.WIDTH - finalWidth) / 2);
      const dy = Math.floor((SpriteEncoder.HEIGHT - finalHeight) / 2);
      
      // Use custom downscaling to preserve fine details (black lines)
      // Standard canvas drawImage tends to wash them out with bilinear filtering
      const scaledData = this.downscaleWithDetailPreservation(
        srcData, 
        bounds.minX, bounds.minY, width, height, 
        finalWidth, finalHeight
      );
      
      destCtx.putImageData(scaledData, dx, dy);
    }
    
    return destCtx.getImageData(0, 0, SpriteEncoder.WIDTH, SpriteEncoder.HEIGHT);
  }

  /**
   * Custom downsealing algorithm that prioritizes dark pixels.
   * Standard resizing averages pixels, causing thin black lines to turn gray/white and disappear.
   * This uses a weighted average based on inverse brightness: darker pixels have much higher weight.
   */
  private downscaleWithDetailPreservation(
    srcBox: ImageData, 
    srcX: number, srcY: number, srcW: number, srcH: number,
    destW: number, destH: number
  ): ImageData {
    const dest = new ImageData(destW, destH);
    const sData = srcBox.data;
    const dData = dest.data;
    const sWidth = srcBox.width; // Stride of the source image
    
    const xRatio = srcW / destW;
    const yRatio = srcH / destH;
    
    for (let y = 0; y < destH; y++) {
      for (let x = 0; x < destW; x++) {
        // Map destination pixel to source region
        const sourceStartX = Math.floor(x * xRatio);
        const sourceStartY = Math.floor(y * yRatio);
        const sourceEndX = Math.min(srcW, Math.ceil((x + 1) * xRatio));
        const sourceEndY = Math.min(srcH, Math.ceil((y + 1) * yRatio));
        
        // Accumulators for weighted average
        let accR = 0;
        let accG = 0;
        let accB = 0;
        let totalWeight = 0;
        
        // Iterate over the source region for this pixel
        // Add offset (srcX, srcY) to coordinates
        for (let sy = sourceStartY; sy < sourceEndY; sy++) {
          for (let sx = sourceStartX; sx < sourceEndX; sx++) {
            // Calculate actual index in the source ImageData
            const idx = ((srcY + sy) * sWidth + (srcX + sx)) * 4;
            
            const r = sData[idx];
            const g = sData[idx + 1];
            const b = sData[idx + 2];
            const a = sData[idx + 3];
            
            // Ignore fully transparent pixels
            if (a < 10) continue;
            
            // Calculate brightness (0-255)
            const brightness = (r + g + b) / 3;
            
            // Weight function: (255 - brightness + 1)^exponent
            // Higher exponent = darker pixels have more influence
            // Default 2.0: Black (0) -> 65,536x weight vs White (255) -> 1x
            const exponent = ConfigService.getDarknessExponent();
            const weight = Math.pow(255 - brightness + 1, exponent);
            
            accR += r * weight;
            accG += g * weight;
            accB += b * weight;
            totalWeight += weight;
          }
        }
        
        const destIdx = (y * destW + x) * 4;
        
        if (totalWeight > 0) {
          dData[destIdx] = accR / totalWeight;
          dData[destIdx + 1] = accG / totalWeight;
          dData[destIdx + 2] = accB / totalWeight;
          dData[destIdx + 3] = 255; // Alpha
        } else {
          // If no pixels contributed (e.g. all transparent), make it white/transparent
          dData[destIdx] = 255;
          dData[destIdx + 1] = 255;
          dData[destIdx + 2] = 255;
          dData[destIdx + 3] = 0;
        }
      }
    }
    
    return dest;
  }

  /**
   * Find the bounding box of non-white pixels
   */
  private findContentBounds(imageData: ImageData): { minX: number, maxX: number, minY: number, maxY: number } | null {
    const { width, height, data } = imageData;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    
    // Scan all pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        
        // Check if pixel is "content"
        // Transparent is background
        if (a < 10) continue;
        
        // White is background (using strict threshold)
        // If it's slightly off-white (artifacts), we consider it background
        if (r > 240 && g > 240 && b > 240) continue;
        
        // It's content
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    
    if (maxX === -1) return null; // Empty image
    return { minX, maxX, minY, maxY };
  }
  
  /**
   * Helper to load image
   */
  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }
  
  /**
   * Quantize pixels to 4 colors (0-3) using configurable thresholds
   * 0 (White) -> 3 (Black) mapping depends on palette,
   * but typically 0=White, 3=Black in standard encoding
   */
  private quantize(imageData: ImageData, thresholds: ThresholdConfig): Uint8Array {
    const { width, height, data } = imageData;
    const output = new Uint8Array(width * height);
    
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      
      // Simple grayscale conversion
      const brightness = (r + g + b) / 3;
      
      // Map brightness to 0-3 (Game Boy colors) using configurable thresholds
      // 255 (White) -> 0
      // 0 (Black) -> 3
      let color = 0;
      if (brightness < thresholds.black) color = 3;           // Black
      else if (brightness < thresholds.darkGray) color = 2;   // Dark Gray
      else if (brightness < thresholds.lightGray) color = 1;  // Light Gray
      else color = 0;                                          // White
      
      output[i] = color;
    }
    
    return output;
  }
  
  /**
   * Encode quantized pixels to 2bpp planar format
   * 7x7 tiles = 49 tiles
   * Each tile 16 bytes
   */
  private encode2bpp(pixels: Uint8Array): Uint8Array {
    const tilesX = SpriteEncoder.WIDTH / SpriteEncoder.TILE_SIZE;
    const tilesY = SpriteEncoder.HEIGHT / SpriteEncoder.TILE_SIZE;
    const tileCount = tilesX * tilesY;
    const buffer = new Uint8Array(tileCount * 16);
    
    let bufferOffset = 0;
    
    // Iterate through tiles in COLUMN-MAJOR order (Pokemon Red format)
    // Tiles are stored column by column, top to bottom, then left to right
    for (let tx = 0; tx < tilesX; tx++) {
      for (let ty = 0; ty < tilesY; ty++) {
        
        // Encode this 8x8 tile
        for (let row = 0; row < 8; row++) {
          let lowByte = 0;
          let highByte = 0;
          
          for (let col = 0; col < 8; col++) {
            const x = tx * 8 + col;
            const y = ty * 8 + row;
            const color = pixels[y * SpriteEncoder.WIDTH + x];
            
            // Color is 0-3 (2 bits: high, low)
            // Bit 0 goes to lowByte, bit 1 goes to highByte
            // Pixels are ordered MSD (bit 7) to LSD (bit 0)
            const bit = 7 - col;
            
            if (color & 1) lowByte |= (1 << bit);
            if (color & 2) highByte |= (1 << bit);
          }
          
          buffer[bufferOffset++] = lowByte;
          buffer[bufferOffset++] = highByte;
        }
      }
    }
    
    return buffer;
  }
}
