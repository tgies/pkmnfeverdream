/**
 * CameraService - Manages camera access for Game Boy Camera feature
 * Handles camera stream, frame capture, and cleanup
 */

export class CameraService {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private facingMode: 'user' | 'environment' = 'environment'; // front or back camera

  /**
   * Check if camera API is available in the browser
   */
  isAvailable(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * Start camera stream and attach to video element
   * @param videoElement - The video element to attach the stream to
   * @param facingMode - 'environment' for back camera, 'user' for front camera
   */
  async startCamera(videoElement: HTMLVideoElement, facingMode?: 'user' | 'environment'): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Camera API not available');
    }

    // Update facing mode if provided
    if (facingMode) {
      this.facingMode = facingMode;
    }

    // Stop any existing stream
    this.stopCamera();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: this.facingMode },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      videoElement.srcObject = this.stream;
      this.videoElement = videoElement;

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        videoElement.onloadedmetadata = () => {
          videoElement.play()
            .then(() => resolve())
            .catch(reject);
        };
        videoElement.onerror = () => reject(new Error('Video failed to load'));
      });
    } catch (error) {
      console.error('Failed to start camera:', error);
      throw error;
    }
  }

  /**
   * Flip between front and back camera
   * Only works on mobile devices with multiple cameras
   */
  async flipCamera(): Promise<void> {
    if (!this.videoElement) {
      throw new Error('Camera not started');
    }
    
    // Toggle facing mode
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    console.log(`📷 Switching to ${this.facingMode === 'user' ? 'front' : 'back'} camera`);
    
    // Restart with new facing mode
    await this.startCamera(this.videoElement, this.facingMode);
  }

  /**
   * Get current facing mode
   */
  getFacingMode(): 'user' | 'environment' {
    return this.facingMode;
  }

  /**
   * Stop camera stream and release resources
   */
  stopCamera(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
  }

  /**
   * Check if camera is currently streaming
   */
  isStreaming(): boolean {
    return this.stream !== null && this.stream.active;
  }

  /**
   * Capture current frame as base64 data URL (PNG)
   * Returns null if no stream is active
   */
  captureFrame(): string | null {
    if (!this.videoElement || !this.isStreaming()) {
      return null;
    }

    const video = this.videoElement;
    const canvas = document.createElement('canvas');
    
    // Use video's natural dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    // Draw current video frame
    ctx.drawImage(video, 0, 0);

    // Return as data URL
    return canvas.toDataURL('image/png');
  }

  /**
   * Capture current frame and crop to square (centered)
   * Better for sprite generation which expects 1:1 aspect ratio
   */
  captureSquareFrame(): string | null {
    if (!this.videoElement || !this.isStreaming()) {
      return null;
    }

    const video = this.videoElement;
    const canvas = document.createElement('canvas');
    
    // Calculate square crop (use smaller dimension)
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    // Calculate offset to center the crop
    const offsetX = (video.videoWidth - size) / 2;
    const offsetY = (video.videoHeight - size) / 2;

    // Draw cropped square from video
    ctx.drawImage(
      video,
      offsetX, offsetY, size, size,  // source
      0, 0, size, size               // destination
    );

    return canvas.toDataURL('image/png');
  }
}

// Export singleton instance
export const cameraService = new CameraService();
