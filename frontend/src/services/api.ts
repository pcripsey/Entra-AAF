import axios from 'axios';

const baseURL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL,
  withCredentials: true,
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
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('username');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const login = (username: string, password: string) =>
  api.post('/admin/login', { username, password });

export const logout = () => api.post('/admin/logout');

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

export default api;
