/**
 * NOSIH complaint portal REST contract.
 *
 * All routes are relative to VITE_NOSIH_API_URL. Authentication uses the JWT
 * returned by the portal login endpoint. Anonymous identity sealing is always
 * performed by the API; this client only sends the is_anonymous preference.
 */

export const DEPARTMENTS = ['AI&DS', 'AIML', 'CSE', 'ECE', 'MECH', 'Cyber Security'] as const;
export type Department = (typeof DEPARTMENTS)[number];
export type AcademicRole = 'YEAR_1' | 'YEAR_2' | 'YEAR_3' | 'FACULTY_STAFF';
export type SpaceKind = 'CLASSROOM' | 'LAB' | 'CANTEEN' | 'BILL_BOT';
export type AssetStatus = 'OK' | 'DEGRADED' | 'FAULTY';
export type Urgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ComplaintStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED_PARTS' | 'RESOLVED';
export type ModerationStatus = 'APPROVED' | 'NEEDS_REWRITE' | 'HELD_ABUSIVE' | 'HELD_HARMFUL';
export type TwinState = 'HEALTHY' | 'FAULTY' | 'DEGRADED' | 'BLOCKED_PARTS';

export interface SessionProfile {
  id: string;
  email: string;
  full_name: string;
  department: Department;
  academic_role: AcademicRole;
  year_number: 1 | 2 | 3 | null;
  section: string | null;
  home_room_code: string | null;
  role: 'STUDENT' | 'FACULTY' | 'STAFF';
}

export interface LoginRequest {
  email: string;
  department: Department;
  academic_role: AcademicRole;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  user: SessionProfile;
}

export interface DirectoryEntry {
  email: string;
  full_name: string;
  department: Department;
  academic_role: AcademicRole;
  year_number: 1 | 2 | 3 | null;
}

export interface AssetTarget {
  asset_code: string;
  asset_type: string;
  slot_index: number;
}

export interface SpaceAsset extends AssetTarget {
  status: AssetStatus;
  label?: string;
}

export interface PeriodContext {
  period_number: number | null;
  time_label?: string;
  class_code?: string | null;
  subject_title?: string | null;
  faculty_name?: string | null;
  student_strength?: number | null;
  away_in_lab_code?: string | null;
  location_status?: string | null;
}

export interface SpaceDetails {
  code: string;
  name?: string;
  kind: SpaceKind;
  block?: string | null;
  floor?: number | null;
  visual_state: TwinState;
  current_period?: PeriodContext | null;
  assets: SpaceAsset[];
}

export interface PhotoUpload {
  id: string;
  url: string;
  content_type: string;
  size_bytes: number;
}

export interface CreateComplaintRequest {
  space_code: string;
  description: string;
  is_anonymous: boolean;
  target_assets: AssetTarget[];
  photo_upload_id?: string;
  client_timestamp: string;
}

export interface FirstResponse {
  space_code: string;
  block_floor?: string | null;
  target_assets: AssetTarget[];
  category: string;
  urgency: Urgency;
  sla_target_minutes: number;
  missing_info_questions: string[];
  merged_duplicate: boolean;
  parent_complaint_id?: string | null;
  parent_ticket_number?: string | null;
  affected_count?: number | null;
}

export interface Complaint {
  id: string;
  ticket_number: string;
  space_code: string;
  space_name?: string | null;
  space_kind: SpaceKind;
  description: string;
  category: string;
  urgency: Urgency;
  status: ComplaintStatus;
  twin_state: TwinState;
  reporter_label: string;
  is_anonymous: boolean;
  reporter_department?: Department | null;
  photo_url?: string | null;
  target_assets: AssetTarget[];
  affected_count: number;
  viewer_has_voted: boolean;
  comment_count: number;
  sla_target_minutes: number;
  sla_due_at?: string | null;
  sla_breach_state?: 'ON_TRACK' | 'WARNING_75' | 'BREACHED_100' | 'PAUSED' | null;
  created_at: string;
  updated_at: string;
  parent_complaint_id?: string | null;
  parent_ticket_number?: string | null;
  first_response?: FirstResponse | null;
}

export interface ModerationRejectedResponse {
  moderation_status: 'NEEDS_REWRITE' | 'HELD_ABUSIVE' | 'HELD_HARMFUL';
  message: string;
  suggested_polite_rewrite?: string | null;
}

export interface ComplaintApprovedResponse {
  moderation_status: 'APPROVED';
  complaint: Complaint;
  first_response: FirstResponse;
}

export type ComplaintSubmissionResponse = ComplaintApprovedResponse | ModerationRejectedResponse;

export interface SupplementAnswer {
  question: string;
  answer: string;
}

export interface SupplementRequest {
  answers: SupplementAnswer[];
}

export interface SupplementResponse {
  complaint: Complaint;
  first_response: FirstResponse;
}

export interface ComplaintComment {
  id: string;
  complaint_id: string;
  body: string;
  author_label: string;
  is_anonymous: boolean;
  created_at: string;
}

export interface CommentApprovedResponse {
  moderation_status: 'APPROVED';
  comment: ComplaintComment;
}

export type CommentSubmissionResponse = CommentApprovedResponse | ModerationRejectedResponse;

export interface ComplaintFilters {
  zone?: 'ALL' | 'BLOCK_A' | 'BLOCK_B' | 'BLOCK_C' | 'LABS' | 'CANTEENS' | 'BILL_BOTS';
  status?: ComplaintStatus | 'ALL';
  category?: string;
  my_department?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_URL = (import.meta.env.VITE_NOSIH_API_URL || 'http://localhost:8000').replace(/\/$/, '');
let accessToken: string | null = null;

export function setApiAccessToken(token: string | null) {
  accessToken = token;
}

function errorMessage(payload: unknown, status: number): string {
  if (typeof payload === 'object' && payload !== null) {
    const body = payload as { detail?: unknown; message?: unknown };
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((item) => (typeof item === 'object' && item && 'msg' in item ? String(item.msg) : String(item)))
        .join(', ');
    }
    if (typeof body.message === 'string') return body.message;
  }
  return `Request failed (${status}). Please try again.`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('Unable to reach NOSIH. Check your connection and try again.', 0);
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = response.status === 204
    ? null
    : contentType.includes('application/json')
      ? await response.json()
      : await response.text();

  if (!response.ok) throw new ApiError(errorMessage(payload, response.status), response.status, payload);
  return payload as T;
}

function queryString(values: object): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'ALL') {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export const api = {
  login: (body: LoginRequest) => request<LoginResponse>('/api/auth/portal-login', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  searchDirectory: (query: string, signal?: AbortSignal) => request<DirectoryEntry[]>(
    `/api/auth/directory${queryString({ query, limit: 8 })}`,
    { signal },
  ),

  getSpace: (spaceCode: string, signal?: AbortSignal) => request<SpaceDetails>(
    `/api/twin/space/${encodeURIComponent(spaceCode)}`,
    { signal },
  ),

  uploadPhoto: (file: File) => {
    const body = new FormData();
    body.append('file', file, file.name);
    return request<PhotoUpload>('/api/uploads/complaint-images', { method: 'POST', body });
  },

  createComplaint: (body: CreateComplaintRequest) => request<ComplaintSubmissionResponse>('/api/complaints', {
    method: 'POST',
    body: JSON.stringify(body),
  }),

  supplementComplaint: (complaintId: string, body: SupplementRequest) => request<SupplementResponse>(
    `/api/complaints/${encodeURIComponent(complaintId)}/supplement`,
    { method: 'POST', body: JSON.stringify(body) },
  ),

  listComplaints: (filters: ComplaintFilters, signal?: AbortSignal) => request<Complaint[]>(
    `/api/complaints${queryString(filters)}`,
    { signal },
  ),

  getComplaint: (complaintId: string) => request<Complaint>(
    `/api/complaints/${encodeURIComponent(complaintId)}`,
  ),

  confirmAffected: (complaintId: string) => request<Complaint>(
    `/api/complaints/${encodeURIComponent(complaintId)}/affected`,
    { method: 'POST' },
  ),

  listComments: (complaintId: string) => request<ComplaintComment[]>(
    `/api/complaints/${encodeURIComponent(complaintId)}/comments`,
  ),

  createComment: (complaintId: string, body: string, isAnonymous: boolean) => request<CommentSubmissionResponse>(
    `/api/complaints/${encodeURIComponent(complaintId)}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ body, is_anonymous: isAnonymous, client_timestamp: new Date().toISOString() }),
    },
  ),
};
