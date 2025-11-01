/**
 * Utility functions for handling captured images
 */

export interface SavedImage {
  filename: string;
  path: string;
  blob: Blob;
  dataUrl: string;
  timestamp: number;
}

/**
 * Generates a unique filename for the captured image
 */
export const generateImageFilename = (): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const randomId = Math.random().toString(36).substring(2, 9);
  return `face-capture-${timestamp}-${randomId}.png`;
};

/**
 * Converts a Blob to a File object
 */
export const blobToFile = (blob: Blob, filename: string): File => {
  return new File([blob], filename, { type: blob.type || 'image/png' });
};

/**
 * Saves image data to browser's local storage (for reference)
 * Note: In a real app, you might want to use IndexedDB for larger files
 */
export const saveImageMetadata = (image: SavedImage): void => {
  try {
    // Store metadata (not the actual blob, as localStorage has size limits)
    const metadata = {
      filename: image.filename,
      path: image.path,
      timestamp: image.timestamp,
      // Store a smaller thumbnail version if needed
      thumbnailUrl: image.dataUrl.substring(0, 100) + '...', // Truncated for example
    };

    // Get existing saved images
    const saved = localStorage.getItem('capturedImages');
    const savedImages = saved ? JSON.parse(saved) : [];

    // Add new image (keep only last 10)
    savedImages.unshift(metadata);
    if (savedImages.length > 10) {
      savedImages.pop();
    }

    localStorage.setItem('capturedImages', JSON.stringify(savedImages));
  } catch (error) {
    console.error('Failed to save image metadata:', error);
  }
};

/**
 * Downloads the image to user's device (optional utility)
 */
export const downloadImage = (dataUrl: string, filename: string): void => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Creates a FormData object for API upload
 */
export const prepareImageFormData = (
  file: File,
  additionalData?: Record<string, any>
): FormData => {
  const formData = new FormData();

  // Add the image file
  formData.append('image', file);

  // Add any additional fields
  if (additionalData) {
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    });
  }

  return formData;
};