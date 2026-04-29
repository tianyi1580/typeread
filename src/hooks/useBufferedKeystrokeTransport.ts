import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  KeystrokeEvent,
  ProcessKeystrokeBatchInput,
  ProcessKeystrokeBatchResult,
  SessionContext,
  SessionSummaryResponse,
  TypingSessionInput,
} from "../types";

/**
 * Options for the useBufferedKeystrokeTransport hook.
 */
interface BufferedKeystrokeTransportOptions {
  /** Whether the desktop environment is ready. */
  desktopReady: boolean;
  /** Context for the current typing session. */
  context: SessionContext;
  /** API function to process a batch of keystrokes. */
  processBatch: (payload: ProcessKeystrokeBatchInput) => Promise<ProcessKeystrokeBatchResult>;
  /** Optional error callback. */
  onError?: (message: string) => void;
}


export function useBufferedKeystrokeTransport({
  desktopReady,
  context,
  processBatch,
  onError,
}: BufferedKeystrokeTransportOptions) {
  const desktopReadyRef = useRef(desktopReady);
  const contextRef = useRef(context);
  const processBatchRef = useRef(processBatch);
  const onErrorRef = useRef(onError);
  const sessionKeyRef = useRef<string | null>(null);
  const pendingEventsRef = useRef<KeystrokeEvent[]>([]);
  const flushQueueRef = useRef(Promise.resolve<ProcessKeystrokeBatchResult | undefined>(undefined));

  useEffect(() => {
    desktopReadyRef.current = desktopReady;
    contextRef.current = context;
    processBatchRef.current = processBatch;
    onErrorRef.current = onError;
  }, [desktopReady, context, processBatch, onError]);

  const ensureSessionKey = useCallback(() => {
    if (!sessionKeyRef.current) {
      sessionKeyRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    return sessionKeyRef.current;
  }, []);

  const resetTransport = useCallback(() => {
    sessionKeyRef.current = null;
    pendingEventsRef.current = [];
  }, []);

  // Keep these callbacks stable so Reader/Practice listeners do not rebind every render.
  const flushPending = useCallback(async (finalizeSession?: TypingSessionInput): Promise<SessionSummaryResponse | undefined> => {
    if (!desktopReadyRef.current) {
      return undefined;
    }

    if (!sessionKeyRef.current && !finalizeSession) {
      return undefined;
    }

    const execute = async () => {
      const sessionKey = ensureSessionKey();
      const events = pendingEventsRef.current;
      if (events.length === 0 && !finalizeSession) {
        return undefined;
      }

      pendingEventsRef.current = [];

      try {
        return await processBatchRef.current({
          sessionKey,
          context: contextRef.current,
          events,
          finalizeSession,
        });
      } catch (caught) {
        if (events.length > 0) {
          pendingEventsRef.current = [...events, ...pendingEventsRef.current];
        }
        const message = typeof caught === "string" ? caught : caught instanceof Error ? caught.message : "Failed to sync keystroke analytics.";
        onErrorRef.current?.(message);
        return undefined;
      }
    };

    const queued = flushQueueRef.current.then(execute, execute);
    flushQueueRef.current = queued.then(
      () => undefined,
      () => undefined,
    );
    const result = await queued;
    if (finalizeSession) {
      resetTransport();
    }
    return result?.savedSession;
  }, [ensureSessionKey, resetTransport]);

  const pushEvent = useCallback((event: KeystrokeEvent) => {
    if (!desktopReadyRef.current) {
      return;
    }

    pendingEventsRef.current.push(event);
    ensureSessionKey();

    if (pendingEventsRef.current.length >= 100) {
      void flushPending();
    }
  }, [ensureSessionKey, flushPending]);

  return useMemo(() => ({
    pushEvent,
    flushPending,
    resetTransport,
  }), [pushEvent, flushPending, resetTransport]);
}
