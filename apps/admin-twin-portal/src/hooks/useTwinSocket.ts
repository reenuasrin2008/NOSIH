import { useEffect } from 'react';
import { TOKEN_STORAGE_KEY } from '../api/client';
import { usePortalStore } from '../store/portalStore';

export function useTwinSocket(authenticated: boolean) {
  useEffect(() => {
    if (!authenticated) return;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let disposed = false;
    let attempts = 0;
    const setStatus = usePortalStore.getState().setSocketStatus;
    const invalidate = usePortalStore.getState().invalidateTwin;

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      const configured = import.meta.env.VITE_NOSIH_WS_URL ?? 'ws://localhost:8000/ws/twin';
      const url = new URL(configured, window.location.href);
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (token) url.searchParams.set('token', token);
      socket = new WebSocket(url);
      socket.onopen = () => { attempts = 0; setStatus('live'); };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string; event?: string; message?: string };
          const type = message.type ?? message.event;
          if (type === 'TWIN_STATE_MUTATED' || type === 'WORK_ORDER_UPDATED' || type === 'SLA_UPDATED' || type === 'STAFF_REASSIGNED') {
            invalidate(message.message ?? 'Live campus state synchronized');
          }
        } catch {
          // Ignore malformed socket frames; authoritative REST state remains unchanged.
        }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (disposed) return;
        setStatus('offline');
        attempts += 1;
        reconnectTimer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5)));
      };
    };
    connect();
    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      socket?.close();
      setStatus('offline');
    };
  }, [authenticated]);
}
