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

  const withoutTrailing = trimmed.replace(/\/$/, '');
  const socketIndex = withoutTrailing.indexOf('/socket.io');
  let url = withoutTrailing;
  let path = SOCKET_IO_PATH;

  if (socketIndex !== -1) {
    url = withoutTrailing.slice(0, socketIndex);
    path = withoutTrailing.slice(socketIndex);
  }

  if (!path.startsWith('/socket.io')) {
    path = SOCKET_IO_PATH;
  }

  console.log('[Socket] Normalized target:', { original: rawUrl, normalized: url, path });

  return { url, path };
}
