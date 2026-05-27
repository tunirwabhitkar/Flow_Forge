import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios';

const api: AxiosInstance = axios.create({
  baseURL: '/rest',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

// Request interceptor — attach bearer token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ff_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — handle 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('ff_token');
      window.location.href = '/auth/login';
    }
    return Promise.reject(error);
  },
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginPayload { email: string; password: string; totpCode?: string }
export interface RegisterPayload { email: string; password: string; firstName: string; lastName: string }
export interface AuthResponse { token: string; user: User }
export interface User {
  id: string; email: string; firstName: string; lastName: string;
  role: 'owner' | 'admin' | 'member' | 'viewer'; createdAt: string; mfaEnabled: boolean;
}

export const authApi = {
  login: (data: LoginPayload) => api.post<AuthResponse>('/auth/login', data),
  register: (data: RegisterPayload) => api.post<AuthResponse>('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<{ user: User }>('/auth/me'),
  setupTotp: () => api.post<{ secret: string; qrCodeUrl: string }>('/auth/mfa/totp/setup'),
  enableTotp: (totpCode: string) => api.post('/auth/mfa/totp/enable', { totpCode }),
};

// ─── Workflows ────────────────────────────────────────────────────────────────

export interface WorkflowSummary {
  id: string; name: string; active: boolean;
  createdAt: string; updatedAt: string;
}
export interface WorkflowDetail extends WorkflowSummary {
  nodes: WorkflowNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
}
export interface WorkflowNode {
  id: string; name: string; type: string; typeVersion: number;
  position: [number, number]; parameters: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
  disabled?: boolean;
}

export const workflowsApi = {
  list: (params?: { limit?: number; offset?: number; projectId?: string }) =>
    api.get<{ data: WorkflowSummary[]; count: number }>('/workflows', { params }),
  get: (id: string) => api.get<WorkflowDetail>(`/workflows/${id}`),
  create: (data: Partial<WorkflowDetail>) =>
    api.post<WorkflowDetail>('/workflows', data),
  update: (id: string, data: Partial<WorkflowDetail>) =>
    api.patch<WorkflowDetail>(`/workflows/${id}`, data),
  delete: (id: string) => api.delete(`/workflows/${id}`),
  activate: (id: string) => api.post<WorkflowDetail>(`/workflows/${id}/activate`),
  deactivate: (id: string) => api.post<WorkflowDetail>(`/workflows/${id}/deactivate`),
  run: (id: string, data?: unknown) =>
    api.post<ExecutionSummary>(`/workflows/${id}/run`, data),
  getVersions: (id: string) => api.get(`/workflows/${id}/versions`),
  rollback: (id: string, versionId: string) =>
    api.post(`/workflows/${id}/versions/${versionId}/rollback`),
};

// ─── Executions ───────────────────────────────────────────────────────────────

export interface ExecutionSummary {
  id: string; workflowId: string; status: string; mode: string;
  startedAt: string; stoppedAt?: string;
}

export const executionsApi = {
  list: (params?: { limit?: number; offset?: number; workflowId?: string }) =>
    api.get<{ data: ExecutionSummary[]; count: number }>('/executions', { params }),
  get: (id: string) => api.get(`/executions/${id}`),
  cancel: (id: string) => api.post(`/executions/${id}/cancel`),
  retry: (id: string) => api.post(`/executions/${id}/retry`),
  delete: (id: string) => api.delete(`/executions/${id}`),
};

// ─── Credentials ──────────────────────────────────────────────────────────────

export interface CredentialSummary {
  id: string; name: string; type: string; createdAt: string;
}

export const credentialsApi = {
  list: (params?: { projectId?: string }) =>
    api.get<{ data: CredentialSummary[] }>('/credentials', { params }),
  create: (data: { name: string; type: string; data: Record<string, unknown> }) =>
    api.post<CredentialSummary>('/credentials', data),
  update: (id: string, data: { name?: string; data?: Record<string, unknown> }) =>
    api.patch<CredentialSummary>(`/credentials/${id}`, data),
  delete: (id: string) => api.delete(`/credentials/${id}`),
};

// ─── Node Types ───────────────────────────────────────────────────────────────

export const nodeTypesApi = {
  list: () => api.get<{ data: NodeTypeDescription[] }>('/node-types'),
  get: (type: string) => api.get<NodeTypeDescription>(`/node-types/${type}`),
};

export interface NodeTypeDescription {
  name: string; displayName: string; description: string;
  group: string[]; icon?: string; color?: string;
  inputs: Array<{ type: string }>; outputs: Array<{ type: string }>;
  properties: unknown[];
  credentials?: unknown[];
}

// ─── AI Assistant ─────────────────────────────────────────────────────────────

export const aiApi = {
  generateNodes: (data: { description: string; existingNodes?: string[]; context?: string }) =>
    api.post('/ai/generate-nodes', data),
  chat: (messages: Array<{ role: string; content: string }>, workflowContext?: string) =>
    api.post<{ reply: string }>('/ai/chat', { messages, workflowContext }),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list: () => api.get<{ data: User[] }>('/users'),
};

// ─── API Keys ─────────────────────────────────────────────────────────────────

export const apiKeysApi = {
  create: (data: { label: string; scopes?: string[]; expiresAt?: string }) =>
    api.post('/me/api-keys', data),
  delete: (id: string) => api.delete(`/me/api-keys/${id}`),
};

export default api;
