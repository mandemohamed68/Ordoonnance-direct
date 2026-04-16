import { getApiUrl } from '../config';

/**
 * Utility to send SMS via the backend API.
 */
export const sendSMS = async (to: string, message: string): Promise<{ success: boolean; error?: string }> => {
  if (!to) return { success: false, error: "Numéro de téléphone manquant" };
  
  try {
    const response = await fetch(getApiUrl("/api/send-sms"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to, message }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error calling SMS API:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};
