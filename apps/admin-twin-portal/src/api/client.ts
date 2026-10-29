import type {
  ApprovalPreflight,
  AuditEntry,
  AuditVerification,
  CampusClock,
  Incident,
  InventoryItem,
  LoginResponse,
  ModerationItem,
  NotificationLog,
  PartRequest,
  PartsPreflightResult,
  PurchaseRequest,
  ResourceLock,
  ResourceType,
  RoomConflictResult,
  SlaClock,
  SpaceDetail,
  StaffRankingResult,
  TimetableSlot,
  TimetableValidation,
  TwinOverview,
  User,
  WorkOrder,
} from '../types';

const API_URL = (import.meta.env.VITE_NOSIH_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');
export const TOKEN_STORAGE_KEY = 'nosih.admin.access_token';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function errorMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null) {
    const value = body as { detail?: unknown; message?: unknown };
    if (typeof value.detail === 'string') return value.detail;
    if (typeof value.message === 'string') return value.message;
    if (typeof value.detail === 'object' && value.detail !== null) {
      const detail = value.detail as { message?: unknown };
      if (typeof detail.message === 'string') return detail.message;
    }
  }
  return `Request failed with status ${status}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const contentType = response.headers.get('content-type') ?? '';
  const body = response.status === 204
    ? undefined
    : contentType.includes('application/json')
      ? await response.json()
      : await response.text();
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new CustomEvent('nosih:unauthorized'));
    throw new ApiError(errorMessage(body, response.status), response.status, body);
  }
  return body as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, payload?: unknown) => request<T>(path, {
  method: 'POST',
  body: payload === undefined ? undefined : JSON.stringify(payload),
});
const patch = <T>(path: string, payload: unknown) => request<T>(path, {
  method: 'PATCH',
  body: JSON.stringify(payload),
});
const list = async <T>(path: string): Promise<T[]> => {
  const result = await request<T[] | { items: T[]; results?: T[] }>(path);
  return Array.isArray(result) ? result : result.items ?? result.results ?? [];
};

/**
 * Frontend/backend contract for the command portal. All operational mutations are
 * performed by these endpoints; the browser never changes authoritative state.
 */
export const api = {
  auth: {
    login: (email: string, password: string) => post<LoginResponse>('/api/auth/login', { email, password }),
    me: () => get<User>('/api/auth/me'),
  },
  twin: {
    overview: () => get<TwinOverview | { spaces: never[] }>('/api/twin/overview'),
    space: (code: string) => get<SpaceDetail>(`/api/twin/space/${encodeURIComponent(code)}`),
  },
  clock: {
    get: () => get<CampusClock>('/api/clock'),
    update: (payload: Partial<Pick<CampusClock, 'day_of_week' | 'current_time'>>) => patch<CampusClock>('/api/clock', payload),
  },
  locks: {
    claim: (resourceType: ResourceType, resourceId: string) => post<ResourceLock>('/api/locks/claim', {
      resource_type: resourceType,
      resource_id: resourceId,
    }),
    heartbeat: (lockId: string) => post<ResourceLock>('/api/locks/heartbeat', { lock_id: lockId }),
    release: (lockId: string) => post<void>('/api/locks/release', { lock_id: lockId }),
  },
  operations: {
    roomConflicts: (spaceCode: string, day: string, fromPeriod: number) => get<RoomConflictResult>(
      `/api/operations/rooms/conflicts/${encodeURIComponent(spaceCode)}?day_of_week=${day}&from_period=${fromPeriod}`,
    ),
    relocate: (payload: {
      faulted_space_code: string;
      target_alternate_code: string;
      day_of_week: string;
      from_period: number;
      lock_id: string;
    }) => post<WorkOrder | { status: string }>('/api/operations/rooms/relocate', payload),
    staffRanking: (workOrderId: string) => get<StaffRankingResult>(`/api/work-orders/${workOrderId}/staff-ranking`),
    assignStaff: (workOrderId: string, staffCode: string, lockId: string) => post<WorkOrder>(
      `/api/work-orders/${workOrderId}/assign-staff`,
      { staff_code: staffCode, lock_id: lockId },
    ),
    partsPreflight: (workOrderId: string) => get<PartsPreflightResult>(`/api/work-orders/${workOrderId}/parts-preflight`),
    reserveParts: (workOrderId: string, parts: PartRequest[], lockId: string) => post<WorkOrder>(
      `/api/work-orders/${workOrderId}/reserve-parts`,
      { parts, lock_id: lockId },
    ),
    complete: (workOrderId: string, resolutionNotes: string) => post<WorkOrder>(
      `/api/work-orders/${workOrderId}/complete`,
      { resolution_notes: resolutionNotes },
    ),
    rebalanceStaff: (staffCode: string, triggerReason: 'SHIFT_ENDED' | 'MARKED_LEAVE' | 'PREEMPTED_BY_CRITICAL') => post<WorkOrder[]>(
      '/api/operations/staff/rebalance',
      { staff_code: staffCode, trigger_reason: triggerReason },
    ),
  },
  incidents: {
    list: () => list<Incident>('/api/admin/incidents'),
  },
  workOrders: {
    list: () => list<WorkOrder>('/api/admin/work-orders'),
  },
  inventory: {
    list: () => list<InventoryItem>('/api/admin/inventory'),
    purchaseRequests: () => list<PurchaseRequest>('/api/admin/purchase-requests'),
    approvalPreflight: (prId: string) => get<ApprovalPreflight>(`/api/purchase-requests/${prId}/approval-preflight`),
    approve: (prId: string) => post<PurchaseRequest>(`/api/purchase-requests/${prId}/approve`, {}),
    override: (prId: string, reason: string, counterSignUserId: string) => post<PurchaseRequest>(
      `/api/purchase-requests/${prId}/override`,
      { override_reason: reason, counter_sign_user_id: counterSignUserId },
    ),
    receiveStock: (prId: string, receivedItems: PartRequest[]) => post<PurchaseRequest>(
      `/api/purchase-requests/${prId}/receive-stock`,
      { received_items: receivedItems },
    ),
  },
  sla: {
    list: () => list<SlaClock>('/api/admin/sla'),
  },
  moderation: {
    list: () => list<ModerationItem>('/api/admin/moderation'),
    unseal: (vaultToken: string, reason: string, policyClause: 'THREAT_TO_LIFE_SAFETY' | 'SEVERE_HARASSMENT_INVESTIGATION') => post<{
      identity: { user_id: string; email: string; full_name: string; department_code?: string; year_number?: number };
      audit_entry_id: string;
    }>(`/api/admin/vault/${encodeURIComponent(vaultToken)}/unseal`, {
      justification_reason: reason,
      policy_clause: policyClause,
    }),
  },
  integrations: {
    receiveEmail: (payload: { from_email: string; subject: string; body: string }) => post<{
      complaint_id?: string;
      moderation_status: string;
      message: string;
    }>('/api/integrations/email/receive', payload),
    notifications: () => list<NotificationLog>('/api/integrations/notifications'),
  },
  timetable: {
    validate: () => get<TimetableValidation>('/api/timetable/validate'),
    forClass: (classCode: string) => list<TimetableSlot>(`/api/timetable/class/${encodeURIComponent(classCode)}`),
    forSpace: (spaceCode: string) => list<TimetableSlot>(`/api/timetable/space/${encodeURIComponent(spaceCode)}`),
  },
  audit: {
    list: (query = '') => list<AuditEntry>(`/api/audit${query ? `?q=${encodeURIComponent(query)}` : ''}`),
    verify: () => get<AuditVerification>('/api/audit/verify'),
  },
};
