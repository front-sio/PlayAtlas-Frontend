const SOCKET_IO_PATH = (process.env.SOCKET_IO_PATH || '/socket.io').trim();

type SocketTarget = {
  url: string;
  path: string;
};

const trimUrl = (value: string) =>
  value
    .replace(/\/socket\.io.*$/i, '')
    .replace(/\/api\/?$/i, '')
    .replace(/\/+$/, '');

export function normalizeSocketTarget(rawUrl?: string): SocketTarget {
  const baseUrl = (rawUrl ?? process.env.NEXT_PUBLIC_ADMIN_WS_URL ?? '').trim();
  if (!baseUrl) {
    return { url: '', path: SOCKET_IO_PATH };
  }

  const normalizedUrl = trimUrl(baseUrl);
  return {
    url: normalizedUrl,
    path: SOCKET_IO_PATH,
  };
}
