import Pusher from "pusher-js";
import { getApiBaseUrl } from "./api";

// Enable client events on the client side
Pusher.logToConsole = process.env.NODE_ENV === "development";

let pusherClient: Pusher | null = null;
let lastApiUrl: string = "";

/**
 * Get or create a Pusher client instance.
 * Recreates the instance if the active store's API URL has changed
 * (e.g. when switching between different client stores).
 */
export const getPusherClient = (): Pusher => {
  const currentApiUrl = getApiBaseUrl();

  // Recreate Pusher if the API URL changed (store switched to different client)
  if (pusherClient && lastApiUrl === currentApiUrl) return pusherClient;

  // Disconnect old instance if exists
  if (pusherClient) {
    try {
      pusherClient.disconnect();
    } catch (e) {}
    pusherClient = null;
  }

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY || "fc1a170b04cd047c782b";
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap2";

  // Get driver JWT token for Pusher authentication
  let authToken = "";
  if (typeof window !== "undefined") {
    try {
      const session = localStorage.getItem("driver_session");
      if (session) {
        const parsed = JSON.parse(session);
        if (parsed?.token) authToken = parsed.token;
      }
    } catch (e) {}
  }

  pusherClient = new Pusher(key, {
    cluster,
    forceTLS: true,
    authEndpoint: `${currentApiUrl}/delivery/auth`,
    auth: {
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    },
  });

  lastApiUrl = currentApiUrl;
  return pusherClient;
};
