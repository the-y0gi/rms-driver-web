import Pusher from "pusher-js";

// Enable client events on the client side
Pusher.logToConsole = process.env.NODE_ENV === "development";

let pusherClient: Pusher | null = null;

export const getPusherClient = (): Pusher => {
  if (pusherClient) return pusherClient;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY || "fc1a170b04cd047c782b";
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap2";
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

  pusherClient = new Pusher(key, {
    cluster,
    forceTLS: true,
    authEndpoint: `${apiUrl}/delivery/auth`,
    auth: {
      headers: {
        // Can add Authorization tokens here in future if needed
      },
    },
  });

  return pusherClient;
};
