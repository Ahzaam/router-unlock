import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export const initSocket = () => {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin, {
      path: "/socket.io",
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      // Listen for server heartbeat to detect connection health
    });

    // Handle server heartbeat
    socket.on("heartbeat", (data) => {
      console.log("Heartbeat received:", new Date(data.timestamp).toISOString());
      // Connection is still alive
    });
  }
  return socket;
};

export const getSocket = () => {
  if (!socket) {
    return initSocket();
  }
  return socket;
};
