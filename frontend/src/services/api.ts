import axios from 'axios';

const baseURL = process.env.REACT_APP_API_URL || '/api';
const csrfClient = axios.create({
  baseURL,
  withCredentials: true,
});
const CSRF_HEADER_NAME = 'X-CSRF-Token';

interface ApiErrorPayload {
  error?: string;
  error_description?: string;
}

const api = axios.create({
  baseURL,
  withCredentials: true,
});

let csrfToken: string | null = null;
let csrfTokenRequest: Promise<string> | null = null;

function clearCsrfToken(): void {
  csrfToken = null;
  csrfTokenRequest = null;
}

export async function fetchCsrfToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && csrfToken) {
    return csrfToken;
  }

  if (!forceRefresh && csrfTokenRequest) {
    return csrfTokenRequest;
  }

  csrfTokenRequest = csrfClient
    .get('/admin/csrf-token')
    .then((response) => {
      const token = (response.data as { csrfToken?: string }).csrfToken;
      if (!token) {
        throw new Error('CSRF token response did not contain a token.');
      }
      csrfToken = token;
      return token;
    })
    .finally(() => {
      csrfTokenRequest = null;
    });

  return csrfTokenRequest;
}

export function isCsrfError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }

  const payload = error.response?.data as ApiErrorPayload | undefined;
  return error.response?.status === 403
    && (payload?.error === 'invalid_csrf_token' || payload?.error === 'invalid_origin');
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isCsrfError(error)) {
    return 'Your admin security token is missing or expired. Refresh the page and try again.';
  }

  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as ApiErrorPayload | undefined;
    return payload?.error_description || payload?.error || fallback;
  }

  return fallback;
}

api.interceptors.request.use(async (request) => {
  const method = (request.method || 'get').toLowerCase();
  const isMutatingMethod = method === 'post' || method === 'put' || method === 'patch' || method === 'delete';
  const requestUrl = request.url || '';
  const isCsrfBootstrapRequest = requestUrl === '/admin/csrf-token' || requestUrl.endsWith('/admin/csrf-token');

  if (isMutatingMethod && !isCsrfBootstrapRequest) {
    const token = await fetchCsrfToken();
    request.headers = request.headers || {};
    request.headers[CSRF_HEADER_NAME] = token;
  }

  return request;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      (error as { response?: { status?: number } }).response?.status === 401
    ) {
      clearCsrfToken();
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('username');
      window.location.href = '/login';
    }

    if (isCsrfError(error)) {
      clearCsrfToken();
    }

    return Promise.reject(error);
  }
);

export const login = async (username: string, password: string) => {
  await fetchCsrfToken();
  return api.post('/admin/login', { username, password });
};

export const logout = async () => {
  const response = await api.post('/admin/logout');
  clearCsrfToken();
  return response;
};

export const getStatus = () => api.get('/admin/status');

export const getEntraConfig = () => api.get('/admin/config/entra');
export const updateEntraConfig = (config: object) => api.put('/admin/config/entra', config);

export const getAafConfig = () => api.get('/admin/config/aaf');
export const updateAafConfig = (config: object) => api.put('/admin/config/aaf', config);

export const getAafMfaConfig = () => api.get('/admin/config/aaf-mfa');
export const updateAafMfaConfig = (config: object) => api.put('/admin/config/aaf-mfa', config);

export const getOidcDiscoveryConfig = () => api.get('/admin/config/oidc-discovery');
export const updateOidcDiscoveryConfig = (config: object) => api.put('/admin/config/oidc-discovery', config);

export const getSessions = () => api.get('/admin/sessions');

export const getAuditLogs = (page = 1, limit = 20, actions?: string) =>
  api.get('/admin/audit-logs', { params: { page, limit, ...(actions ? { actions } : {}) } });

export const getAttributeMappings = () => api.get('/admin/attribute-mappings');
export const updateAttributeMappings = (mappings: object) =>
  api.put('/admin/attribute-mappings', mappings);

export const getBackendLogs = (params: {
  type?: string;
  date?: string;
  page?: number;
  limit?: number;
  search?: string;
}) => api.get('/admin/backend-logs', { params });

export const getLogLevel = () => api.get('/admin/log-level');
export const setLogLevel = (level: 'info' | 'debug') => api.put('/admin/log-level', { level });

export default api;
