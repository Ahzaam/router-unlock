import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const initSocket = () => {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin, {
      path: '/socket.io',
      autoConnect: true,
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
