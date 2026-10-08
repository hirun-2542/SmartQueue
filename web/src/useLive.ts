import { useCallback, useEffect, useRef, useState } from 'react';
import { HubConnectionBuilder, HubConnectionState, LogLevel, type HubConnection, type IRetryPolicy } from '@microsoft/signalr';
import type { ConsoleSnapshot } from './consoleTypes';
import type { CustomerTicket } from './ticketTypes';

/** One authorized live scope per hook: an Owner Shop, a public Shop or a private Ticket link. */
export type LiveScope =
  | { kind: 'shop'; shopId: string; queueId?: string | null }
  | { kind: 'public'; publicId: string }
  | { kind: 'ticket'; secret: string };
export type LiveScopeKind = LiveScope['kind'];
export type LiveStatus = 'off' | 'connecting' | 'live' | 'reconnecting' | 'stale';
export type LiveKind = 'shop' | 'public' | 'ticket' | 'expired';
/** `snapshot` is the authoritative reply to a subscription; `update` is post-commit fan-out. */
export type LiveSource = 'snapshot' | 'update';
export type LiveReason = 'connected' | 'reconnected' | 'visible' | 'online' | 'retry';

export interface LiveMessage {
  kind: LiveKind;
  shopId: string;
  version: number;
  serverTime: string;
  publicId?: string | null;
  ticketId?: string | null;
  console?: ConsoleSnapshot | null;
  ticket?: CustomerTicket | null;
}

export interface LiveState {
  status: LiveStatus;
  /** True while the UI must not trust its current state for unsafe Owner actions. */
  stale: boolean;
  serverTime: string | null;
  version: number | null;
  error: string | null;
  retry: () => void;
}

export interface LiveOptions {
  scope: LiveScope | null;
  enabled?: boolean;
  /**
   * Called for every accepted message in delivery order. Messages that repeat or predate the applied
   * version are dropped, so a delayed or duplicated fan-out cannot move the UI backwards.
   */
  onMessage?: (message: LiveMessage, source: LiveSource) => void;
  /** Called after every (re)connect and whenever the phone returns to the foreground. */
  resync?: (info: { reason: LiveReason; serverTime: string | null }) => void | Promise<void>;
}

const retryPolicy: IRetryPolicy = {
  nextRetryDelayInMilliseconds: context => Math.min(15000, 1000 * 2 ** Math.min(context.previousRetryCount, 4)),
};

const scopeKey = (scope: LiveScope) =>
  scope.kind === 'shop' ? `shop:${scope.shopId}` : scope.kind === 'public' ? `public:${scope.publicId}` : `ticket:${scope.secret}`;

export function useLive({ scope, enabled = true, onMessage, resync }: LiveOptions): LiveState {
  const [status, setStatus] = useState<LiveStatus>(() => (scope && enabled ? 'connecting' : 'off'));
  const [serverTime, setServerTime] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const connection = useRef<HubConnection | null>(null);
  const resume = useRef<() => Promise<void>>(async () => {});
  const messageHandler = useRef(onMessage); messageHandler.current = onMessage;
  const resyncHandler = useRef(resync); resyncHandler.current = resync;
  const wantedScope = useRef<LiveScope | null>(scope); wantedScope.current = scope;
  const serverTimeRef = useRef<string | null>(null);
  const statusRef = useRef<LiveStatus>('off'); statusRef.current = status;
  const applied = useRef<number | null>(null);
  const key = scope ? scopeKey(scope) : '';
  const selectedQueue = scope?.kind === 'shop' ? scope.queueId ?? '' : '';

  const receive = useCallback((message: LiveMessage, source: LiveSource, expected: LiveScopeKind) => {
    if (!message || typeof message.kind !== 'string') return;
    const kind = message.kind === 'expired' ? 'ticket' : message.kind;
    if (kind !== expected) return;
    if (typeof message.serverTime === 'string') {
      serverTimeRef.current = message.serverTime;
      setServerTime(message.serverTime);
    }
    if (typeof message.version === 'number') {
      const last = applied.current;
      // A snapshot read before a newer fan-out already applied must not move the view backwards; an equal
      // version is still applied because a resync snapshot also refreshes the server clock and selection.
      if (last !== null && message.version < last) return;
      if (source === 'update' && last !== null && message.version === last) return;
      applied.current = last === null ? message.version : Math.max(last, message.version);
      setVersion(applied.current);
    }
    messageHandler.current?.(message, source);
  }, []);

  useEffect(() => {
    const active = enabled ? scope : null;
    applied.current = null;
    serverTimeRef.current = null;
    setVersion(null);
    setServerTime(null);
    setError(null);
    if (!active) {
      connection.current = null;
      setStatus('off');
      return;
    }
    const expected = active.kind;
    let disposed = false;
    const hub = new HubConnectionBuilder().withUrl('/live').withAutomaticReconnect(retryPolicy).configureLogging(LogLevel.Warning).build();
    connection.current = hub;

    const subscribe = async () => {
      const wanted = wantedScope.current;
      if (!wanted) return;
      if (wanted.kind === 'shop') await hub.invoke('SubscribeShop', wanted.shopId, wanted.queueId ?? null);
      else if (wanted.kind === 'public') await hub.invoke('SubscribePublic', wanted.publicId);
      else await hub.invoke('SubscribeTicket', wanted.secret);
    };
    const connect = async (reason: LiveReason) => {
      if (disposed) return;
      setStatus('connecting');
      try {
        if (hub.state !== HubConnectionState.Connected) await hub.start();
        await subscribe();
        if (disposed) return;
        setError(null);
        await resyncHandler.current?.({ reason, serverTime: serverTimeRef.current });
        if (!disposed) setStatus('live');
      } catch (failure) {
        if (disposed) return;
        setError(failure instanceof Error ? failure.message : 'subscribe_failed');
        setStatus('stale');
      }
    };
    resume.current = async () => {
      if (disposed) return;
      if (hub.state !== HubConnectionState.Connected) {
        await connect('retry');
        return;
      }
      try {
        setStatus('connecting');
        await subscribe();
        await resyncHandler.current?.({ reason: 'visible', serverTime: serverTimeRef.current });
        if (!disposed) setStatus('live');
      } catch (failure) {
        if (disposed) return;
        setError(failure instanceof Error ? failure.message : 'subscribe_failed');
        setStatus('stale');
      }
    };

    hub.on('snapshot', (message: LiveMessage) => receive(message, 'snapshot', expected));
    hub.on('update', (message: LiveMessage) => receive(message, 'update', expected));
    hub.onreconnecting(() => { if (!disposed) setStatus('reconnecting'); });
    hub.onreconnected(async () => {
      if (disposed) return;
      setStatus('connecting');
      try {
        await subscribe();
        if (disposed) return;
        setError(null);
        await resyncHandler.current?.({ reason: 'reconnected', serverTime: serverTimeRef.current });
        if (!disposed) setStatus('live');
      } catch (failure) {
        if (disposed) return;
        setError(failure instanceof Error ? failure.message : 'subscribe_failed');
        setStatus('stale');
      }
    });
    hub.onclose(() => { if (!disposed) setStatus('stale'); });

    void connect('connected');
    return () => {
      disposed = true;
      connection.current = null;
      void hub.stop();
    };
  }, [key, enabled, receive]);

  useEffect(() => {
    if (!enabled || !key) return;
    const foreground = () => { if (document.visibilityState === 'visible') void resume.current(); };
    const reconnectIfStale = () => { if (document.visibilityState === 'visible' && statusRef.current !== 'live') void resume.current(); };
    document.addEventListener('visibilitychange', foreground);
    window.addEventListener('online', reconnectIfStale);
    window.addEventListener('focus', reconnectIfStale);
    return () => {
      document.removeEventListener('visibilitychange', foreground);
      window.removeEventListener('online', reconnectIfStale);
      window.removeEventListener('focus', reconnectIfStale);
    };
  }, [key, enabled]);

  useEffect(() => {
    const wanted = wantedScope.current;
    if (!enabled || wanted?.kind !== 'shop') return;
    const hub = connection.current;
    if (!hub || hub.state !== HubConnectionState.Connected) return;
    void hub.invoke('SubscribeShop', wanted.shopId, wanted.queueId ?? null).catch(() => setStatus('stale'));
  }, [key, selectedQueue, enabled]);

  const retry = useCallback(() => { void resume.current(); }, []);
  return { status, stale: status === 'connecting' || status === 'reconnecting' || status === 'stale', serverTime, version, error, retry };
}
