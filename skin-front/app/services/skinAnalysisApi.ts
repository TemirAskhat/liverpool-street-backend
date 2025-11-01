/**
 * API service for skin analysis backend
 */

const BACKEND_ENDPOINT = process.env.NEXT_PUBLIC_SKIN_BACKEND_URL || '';

export interface SkinAnalysisRequest {
  image: File;
  userId?: string;
  metadata?: {
    captureTime: number;
    deviceInfo?: string;
    [key: string]: any;
  };
}

export interface SkinAnalysisResponse {
  success: boolean;
  analysisId?: string;
  results?: {
    skinType?: string;
    concerns?: string[];
    recommendations?: string[];
    [key: string]: any;
  };
  error?: string;
}

/**
 * Sends a captured face image to the backend for skin analysis
 *
 * Example curl equivalent:
 * curl -X POST http://backend-url/analyze \
 *   -F "image=@/path/to/image.png" \
 *   -F "userId=user123" \
 *   -F "metadata={...}"
 */
export const analyzeSkinImage = async (
  request: SkinAnalysisRequest
): Promise<SkinAnalysisResponse> => {
  if (!BACKEND_ENDPOINT) {
    throw new Error(
      'Backend endpoint not configured. Please set NEXT_PUBLIC_SKIN_BACKEND_URL environment variable.'
    );
  }

  try {
    const formData = new FormData();

    // Add the image file with a specific field name
    // The backend expects a field named 'image' with the file
    formData.append('image', request.image, request.image.name);

    // Add optional user ID
    if (request.userId) {
      formData.append('userId', request.userId);
    }

    // Add metadata if provided
    if (request.metadata) {
      formData.append('metadata', JSON.stringify(request.metadata));
    }

    // Log for debugging (remove in production)
    console.log('Sending image to backend:', {
      endpoint: BACKEND_ENDPOINT,
      imageName: request.image.name,
      imageSize: request.image.size,
      imageType: request.image.type,
    });

    const response = await fetch(`${BACKEND_ENDPOINT}/analyze`, {
      method: 'POST',
      body: formData,
      // Note: Don't set Content-Type header when sending FormData
      // The browser will set it automatically with the correct boundary
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      ...data,
    };
  } catch (error) {
    console.error('Skin analysis API error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

/**
 * Alternative: Send image as base64 JSON (if your backend prefers JSON)
 */
export const analyzeSkinImageJSON = async (
  imageDataUrl: string,
  userId?: string,
  metadata?: any
): Promise<SkinAnalysisResponse> => {
  if (!BACKEND_ENDPOINT) {
    throw new Error(
      'Backend endpoint not configured. Please set NEXT_PUBLIC_SKIN_BACKEND_URL environment variable.'
    );
  }

  try {
    const response = await fetch(`${BACKEND_ENDPOINT}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: imageDataUrl, // Base64 data URL
        userId,
        metadata: {
          ...metadata,
          captureTime: Date.now(),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      ...data,
    };
  } catch (error) {
    console.error('Skin analysis API error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

/**
 * Check backend health/status
 */
export const checkBackendStatus = async (): Promise<boolean> => {
  if (!BACKEND_ENDPOINT) {
    return false;
  }

  try {
    const response = await fetch(`${BACKEND_ENDPOINT}/health`, {
      method: 'GET',
    });
    return response.ok;
  } catch {
    return false;
  }
};