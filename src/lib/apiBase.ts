const DEFAULT_API_PORT = 8081;
const DEFAULT_API_PATH = '/api';

const normalizeUrl = (value?: string) => {
  if (!value) return '';
  return value
    .trim()
    .replace(/^https?:\/(?!\/)/, (match) => `${match}/`)
    .replace(/\/+$/, '');
};

function resolveDevApiBase() {
  if (typeof window === 'undefined') {
    return `http://localhost:${DEFAULT_API_PORT}${DEFAULT_API_PATH}`;
  }
  const hostname = window.location.hostname;
  const host =
    hostname === 'localhost' || hostname === '127.0.0.1'
      ? 'localhost'
      : hostname;
  return `http://${host}:${DEFAULT_API_PORT}${DEFAULT_API_PATH}`;
}

export function getApiBaseUrl() {
  const envUrl = normalizeUrl(
    process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_GATEWAY_URL
  );
  const adminWsBase = normalizeUrl(process.env.NEXT_PUBLIC_ADMIN_WS_URL);
  const normalizedEnvUrl = envUrl;

  // Server-side: Prefer explicit env URL (works for standalone/prod deployments)
  if (typeof window === 'undefined') {
    if (normalizedEnvUrl) {
      if (normalizedEnvUrl.startsWith('/') && adminWsBase) {
        return `${adminWsBase}${normalizedEnvUrl}`;
      }
      return normalizedEnvUrl;
    }

    if (adminWsBase) {
      return `${adminWsBase}${DEFAULT_API_PATH}`;
    }

    if (process.env.NODE_ENV === 'production') {
      // Fallback for legacy deployments where the API gateway is local
      return `http://localhost:${DEFAULT_API_PORT}${DEFAULT_API_PATH}`;
    }

    return resolveDevApiBase().replace(/\/+$/, '');
  }

  // Client-side: Use the configured external URL
  if (process.env.NODE_ENV === 'production') {
    if (normalizedEnvUrl) {
      if (normalizedEnvUrl.startsWith('/') && adminWsBase) {
        return `${adminWsBase}${normalizedEnvUrl}`;
      }
      return normalizedEnvUrl;
    }

    if (adminWsBase) {
      return `${adminWsBase}${DEFAULT_API_PATH}`;
    }

    return DEFAULT_API_PATH;
  }
  if (!envUrl) {
    return resolveDevApiBase().replace(/\/+$/, '');
  }
  return normalizedEnvUrl;
}
