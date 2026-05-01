/**
 * Application configuration
 */
// In local development for mobile, you might need to change this to your computer's IP
// example: 'http://192.168.1.10:3000'
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Helper to get full API URL
 * @param path The API path (e.g., '/api/send-sms')
 * @returns The full URL
 */
export const getApiUrl = (path: string) => {
  if (path.startsWith('http')) return path;
  
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // If we have an explicit base URL, use it
  if (API_BASE_URL) {
    return `${API_BASE_URL}${cleanPath}`;
  }
  
  // On web, relative paths work. On native mobile with capacitor,
  // we might need to point to the server if it's not the same origin.
  return cleanPath;
};
