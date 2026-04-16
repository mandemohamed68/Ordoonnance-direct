/**
 * Application configuration
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Helper to get full API URL
 * @param path The API path (e.g., '/api/send-sms')
 * @returns The full URL
 */
export const getApiUrl = (path: string) => {
  if (path.startsWith('http')) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
};
