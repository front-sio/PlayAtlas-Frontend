const SOCKET_IO_PATH = '/socket.io';

type SocketTarget = {
  url: string;
  path: string;
};

export function normalizeSocketTarget(rawUrl: string): SocketTarget {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { url: '', path: SOCKET_IO_PATH };
  }

  const url = trimmed.replace(/\/socket\.io\/?$/, '');
  return { url, path: SOCKET_IO_PATH };
}

