const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000/api";

// ── Token helpers ────────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function setToken(token: string, user?: any): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('token', token);
  if (user) {
    localStorage.setItem('user', JSON.stringify(user));
  }
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

// ── Core request ─────────────────────────────────────────────────────────────

export async function request<T = any>(path: string, options: any = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const userStr = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
  const user = userStr ? JSON.parse(userStr) : null;
  const orgId = user?.organizationId || user?.orgId;

  const url = path.startsWith('http') ? path : `${API_URL}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    "x-organization-id": typeof window !== "undefined" ? localStorage.getItem("organizationId") || orgId : orgId,
    ...options.headers,
  };

  // Automatically handle body stringification and Content-Type
  let body = options.body;
  if (body) {
    if (body instanceof FormData) {
      if (headers['Content-Type']) delete headers['Content-Type'];
    } else {
      body = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
  }

  console.log("Fetching:", url);
  console.log(`[API REQUEST] ${options.method || 'GET'} ${url}`);

  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers,
      body
    });

    let json: any = null;
    try {
      json = await res.json();
    } catch (e) {
      json = null;
    }

    if (token) {
      console.log(`[API RESPONSE] ${path} Status: ${res.status}`);
      if (json) console.log("[API DATA]:", json);
    }

    if (!res.ok) {
      console.error("API Error Response:", json?.message || "Request failed");
      throw new Error(json?.message || "Request failed");
    }

    return json as T;
  } catch (err: any) {
    console.error("FETCH ERROR:", err);
    throw err;
  }
}

// ── HTTP convenience ─────────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ── Domain-level API functions ────────────────────────────────────────────────

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ token: string; user: any }>('/auth/login', { email, password }),
  register: (payload: unknown) =>
    api.post<{ token: string; user: any }>('/auth/register', payload),
  me: () => api.get<any>('/auth/me'),
};

// Projects
export const projectsApi = {
  getAll: (params = '') => api.get<any>(`/projects?limit=200${params}`),
  getById: (id: string) => api.get<any>(`/projects/${id}`),
  create: (body: unknown) => api.post<any>('/projects', body),
  update: (id: string, body: unknown) => api.put<any>(`/projects/${id}`, body),
  remove: (id: string) => api.delete<any>(`/projects/${id}`),
};

// Tasks
export const tasksApi = {
  getAll: (params = '') => api.get<any>(`/tasks?limit=200${params}`),
  getById: (id: string) => api.get<any>(`/tasks/${id}`),
  create: (body: unknown) => api.post<any>('/tasks', body),
  update: (id: string, body: unknown) => api.put<any>(`/tasks/${id}`, body),
  remove: (id: string) => api.delete<any>(`/tasks/${id}`),
};

// Timesheets
export const timesheetsApi = {
  getAll: (params = '') => api.get<any>(`/timesheets?limit=100${params}`),
  create: (body: unknown) => api.post<any>('/timesheets', body),
  update: (id: string, body: unknown) => api.put<any>(`/timesheets/${id}`, body),
  approve: (id: string) => api.patch<any>(`/timesheets/${id}/approve`, {}),
  reject: (id: string) => api.patch<any>(`/timesheets/${id}/reject`, {}),
  remove: (id: string) => api.delete<any>(`/timesheets/${id}`),
  clockIn: (body: unknown) => api.post<any>('/timesheets/clock-in', body),
  clockOut: (body: unknown) => api.post<any>('/timesheets/clock-out', body),
};

// Reports
export const reportsApi = {
  projects: () => api.get<any>('/reports/projects'),
  productivity: () => api.get<any>('/reports/productivity'),
  delays: () => api.get<any>('/reports/delays'),
  getConsolidated: () => api.get<any>('/reports'),
};

// Notifications
export const notificationsApi = {
  getAll: (params = '') => api.get<any>(`/notifications?limit=50${params}`),
  markRead: (id: string) => api.put<any>(`/notifications/${id}/read`, {}),
  remove: (id: string) => api.delete<any>(`/notifications/${id}`),
};

// Activity
export const activityApi = {
  getAll: (params = '') => api.get<any>(`/activity?limit=50${params}`),
  recent: (limit = 8) => api.get<any>(`/activity/recent?limit=${limit}`),
};

// Discussions
export const discussionsApi = {
  getAll: (params = '') => api.get<any>(`/discussions?limit=30${params}`),
  getById: (id: string) => api.get<any>(`/discussions/${id}`),
  create: (body: unknown) => api.post<any>('/discussions', body),
  addComment: (id: string, content: string) =>
    api.post<any>(`/discussions/${id}/comments`, { content }),
};

// Users / Profile
export const userApi = {
  getMe: () => api.get<any>('/users/me'),
  updateProfile: (body: unknown) => api.put<any>('/users/update', body),
  changePassword: (body: unknown) => api.put<any>('/users/change-password', body),
  getAll: (params = '') => api.get<any>(`/users?limit=100${params}`),
};

// Admin
export const adminApi = {
  getUsers: (params = '') => api.get<any>(`/admin/users?limit=100${params}`),
  createUser: (body: unknown) => api.post<any>('/admin/users', body),
  updateUser: (id: string, body: unknown) => api.put<any>(`/admin/users/${id}`, body),
  deleteUser: (id: string) => api.delete<any>(`/admin/users/${id}`),
};

// Employees (org-scoped — accessible to admin, hr, project_manager, manager)
export const employeesApi = {
  // Get all employees in the org (for dropdowns in tasks, attendance, leaves)
  getAll: (params = '') => api.get<any>(`/hrms/employees?limit=500${params}`),
  // Create new employee (calls /hrms/employees POST — admin/HR only)
  create: (body: unknown) => api.post<any>('/hrms/employees', body),
  // Update employee
  update: (id: string, body: unknown) => api.put<any>(`/hrms/employees/${id}`, body),
  // Delete employee
  remove: (id: string) => api.delete<any>(`/hrms/employees/${id}`),
};

// Dashboard
export const dashboardApi = {
  summary: () => api.get<any>('/dashboard/summary'),
  health: () => api.get<any>('/dashboard/health'),
  taskAnalytics: () => api.get<any>('/dashboard/task-analytics'),
  projectProgress: () => api.get<any>('/dashboard/project-progress'),
  workload: () => api.get<any>('/dashboard/workload'),
  costAnalysis: () => api.get<any>('/dashboard/cost-analysis'),
  recentActivity: (limit = 10) => api.get<any>(`/dashboard/recent-activity?limit=${limit}`),
  getUnified: () => api.get<any>('/dashboard'),
};

export const overviewApi = {
  get: () => api.get<any>('/overview'),
};

// HRMS / HR Admin
export const hrmsApi = {
  stats: () => api.get<any>('/hrms/dashboard'),
  // Employees
  getEmployees: (params = '') => api.get<any>(`/hrms/employees?limit=200${params}`),
  createEmployee: (body: unknown) => api.post<any>('/hrms/employees', body),
  updateEmployee: (id: string, body: unknown) => api.put<any>(`/hrms/employees/${id}`, body),
  deleteEmployee: (id: string) => api.delete<any>(`/hrms/employees/${id}`),
  // Departments
  getDepartments: () => api.get<any>('/hrms/departments'),
  createDepartment: (body: unknown) => api.post<any>('/hrms/departments', body),
  updateDepartment: (id: string, body: unknown) => api.put<any>(`/hrms/departments/${id}`, body),
  deleteDepartment: (id: string) => api.delete<any>(`/hrms/departments/${id}`),
  // Attendance & Leaves (Admin)
  getAttendance: (params = '') => api.get<any>(`/hrms/attendance?${params}`),
  getLeaves: (params = '') => api.get<any>(`/hrms/leaves?${params}`),
  approveLeave: (id: string) => api.patch<any>(`/hrms/leaves/${id}/approve`, {}),
  rejectLeave: (id: string) => api.patch<any>(`/hrms/leaves/${id}/reject`, {}),
  updateLeaveStatus: (id: string, body: unknown) => api.put<any>(`/hrms/leaves/${id}/status`, body),
};

// Attendance Service (Employee)
export const attendanceApi = {
  getStats: () => api.get<any>('/attendance/stats'),
  getMonthlyChart: () => api.get<any>('/attendance/chart'),
  getHistory: (params = '') => api.get<any>(`/attendance/my?${params}`),
  checkIn: () => api.post<any>('/attendance/checkin', {}),
  checkOut: () => api.post<any>('/attendance/checkout', {}),
};

// Leave Service (Employee)
export const leaveApi = {
  apply: (body: unknown) => api.post<any>('/leaves', body),
  getHistory: () => api.get<any>('/leaves/my'),
  delete: (id: string) => api.delete<any>(`/leaves/${id}`),
};

// Employee Self-Service (Combined for compatibility)
export const employeeApi = {
  getProfile: () => api.get<any>('/employee/me'),
  getStats: attendanceApi.getStats,
  getMonthlyChart: attendanceApi.getMonthlyChart,
  getAttendance: attendanceApi.getHistory,
  checkIn: attendanceApi.checkIn,
  checkOut: attendanceApi.checkOut,
  getLeaves: leaveApi.getHistory,
  applyLeave: leaveApi.apply,
};

export const departmentApi = hrmsApi;
export const employeeProfileApi = employeeApi;

// Calendar — day-level data for any logged-in user
export const calendarApi = {
  getDayData: (date: string) => api.get<any>(`/calendar?date=${date}`),
};

// Users dropdown — works for ALL roles (no HRMS restriction)
// Use this in task modals, assignment dropdowns, etc.
export const usersDropdownApi = {
  getAll: (params = '') => api.get<any>(`/users?limit=500${params}`),
};

export default api;

