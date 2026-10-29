import type { Complaint, ComplaintComment } from './client';

export interface PortalSocketEvent {
  type: 'COMPLAINT_CREATED' | 'COMPLAINT_UPDATED' | 'COMMENT_CREATED' | 'TWIN_STATE_MUTATED' | string;
  complaint?: Complaint;
  complaint_id?: string;
  comment?: ComplaintComment;
  space_code?: string;
  visual_state?: Complaint['twin_state'];
  payload?: Record<string, unknown>;
}

type EventHandler = (event: PortalSocketEvent) => void;
type StatusHandler = (connected: boolean) => void;

const configuredUrl = import.meta.env.VITE_NOSIH_WS_URL || 'ws://localhost:8000/ws/portal';

function portalWebSocketUrl(token: string): string {
  const base = configuredUrl.endsWith('/ws/portal')
    ? configuredUrl
    : `${configuredUrl.replace(/\/$/, '')}/ws/portal`;
  const url = new URL(base);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  if (url.protocol === 'http:') url.protocol = 'ws:';
  url.searchParams.set('token', token);
  return url.toString();
}

export function connectPortalSocket(token: string, onEvent: EventHandler, onStatus: StatusHandler) {
  let socket: WebSocket | null = null;
  let disposed = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let attempts = 0;

  const clearHeartbeat = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
  };

  const connect = () => {
    if (disposed) return;
    socket = new WebSocket(portalWebSocketUrl(token));

    socket.onopen = () => {
      attempts = 0;
      onStatus(true);
      clearHeartbeat();
      heartbeat = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'PING' }));
      }, 25_000);
    };

    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(String(message.data)) as PortalSocketEvent;
        onEvent(event);
      } catch {
        // Ignore malformed socket frames; REST state remains authoritative.
      }
    };

    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      clearHeartbeat();
      onStatus(false);
      if (disposed) return;
      const delay = Math.min(30_000, 1_000 * 2 ** attempts);
      attempts += 1;
      retryTimer = setTimeout(connect, delay);
    };
  };

  connect();

  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    clearHeartbeat();
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    onStatus(false);
  };
}
