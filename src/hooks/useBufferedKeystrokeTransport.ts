import { useEffect, useRef } from "react";
import type {
  KeystrokeEvent,
  ProcessKeystrokeBatchInput,
  ProcessKeystrokeBatchResult,
  SessionContext,
  SessionSummaryResponse,
  TypingSessionInput,
} from "../types";

interface BufferedKeystrokeTransportOptions {
  desktopReady: boolean;
  context: SessionContext;
  processBatch: (payload: ProcessKeystrokeBatchInput) => Promise<ProcessKeystrokeBatchResult>;
  onError?: (message: string) => void;
}

export function useBufferedKeystrokeTransport({
  desktopReady,
  context,
  processBatch,
  onError,
}: BufferedKeystrokeTransportOptions) {
  const contextRef = useRef(context);
  const sessionKeyRef = useRef<string | null>(null);
  const pendingEventsRef = useRef<KeystrokeEvent[]>([]);
  const flushQueueRef = useRef(Promise.resolve<ProcessKeystrokeBatchResult | undefined>(undefined));

  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  function ensureSessionKey() {
    if (!sessionKeyRef.current) {
      sessionKeyRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
    return sessionKeyRef.current;
  }

  function resetTransport() {
    sessionKeyRef.current = null;
    pendingEventsRef.current = [];
  }

  function pushEvent(event: KeystrokeEvent) {
    if (!desktopReady) {
      return;
    }

    pendingEventsRef.current.push(event);
    ensureSessionKey();

    if (pendingEventsRef.current.length >= 100) {
      void flushPending();
    }
  }

  async function flushPending(finalizeSession?: TypingSessionInput): Promise<SessionSummaryResponse | undefined> {
    if (!desktopReady) {
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
        return await processBatch({
          sessionKey,
          context: contextRef.current,
          events,
          finalizeSession,
        });
      } catch (caught) {
        if (events.length > 0) {
          pendingEventsRef.current = [...events, ...pendingEventsRef.current];
        }
        onError?.(caught instanceof Error ? caught.message : "Failed to sync keystroke analytics.");
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
  }

  return {
    pushEvent,
    flushPending,
    resetTransport,
  };
}
