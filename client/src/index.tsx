/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useContext, useState } from 'react';

const DEFAULT_PING_INTERVAL = 30_000; // TODO get from server

export interface WebSocketMessage {
  event: string;
  error?: boolean;
  replyTo?: string;
  ack?: boolean; // If the replyTo was the response
  payload?: unknown;
}

export interface IWebsocketOptions {
  /** Delay in milliseconds between reconnecting when WebSocket is closed
   * @default 1500
   */
  reconnectDelay: number;

  pingInterval: number;

  /** Max message size in bytes
   * @default 1MB
   */
  maxPayload?: number;
}

export class WebSocketWrapper extends WebSocket {
  private readonly eventSubscribers: Map<string, ((data: unknown, raw: WebSocketMessage) => any)[]> = new Map();

  constructor(url: string, maxPayload: number = 1024 * 1024, protocols?: string[] | string) {
    super(url, protocols);

    const connectionTimeout = setTimeout(() => {
      if (this.readyState !== WebSocket.CONNECTING) return;
      this.close();
    }, 10_000);

    this.addEventListener('open', () => {
      clearTimeout(connectionTimeout);
    });

    this.addEventListener('message', msg => {
      try {
        let msgStr = msg.data.toString();
        if (msgStr.length > maxPayload) return console.error('[WebSocketLibrary] Message exceeds max payload size');

        const data = JSON.parse(msgStr);
        msgStr = null;

        const listeners = [...(this.eventSubscribers.get(data.event) || []), ...(this.eventSubscribers.get('_ALL') || [])];
        if (!listeners) return;

        listeners.forEach(async listener => {
          const replyTo = data.replyTo;
          const shouldReply = replyTo !== undefined && !data.ack;

          try {
            let replyMsg = listener(data.payload, data); // Fire message event

            if (replyMsg instanceof Promise) replyMsg = await replyMsg; // Await promise if it's async

            // If the server wants a reply and there is data to reply with, send it
            if (shouldReply && replyMsg) this.send(JSON.stringify({ event: data.event, replyTo, ack: true, payload: replyMsg } satisfies WebSocketMessage));
          } catch (e) {
            console.error(`[WebSocketLibrary] Caught error calling event subscriber for "${data.event}"`, e);

            // If they were expecting a reply and we errored, let them know
            if (shouldReply) this.send(JSON.stringify({ event: data.event, replyTo, ack: true, error: true, payload: (e as any).message || 'Unknown error' } satisfies WebSocketMessage));
          }
        });
      } catch (e) {
        console.error('Error parsing websocket message', e);
      }
    });

    this.addEventListener('error', () => {
      clearTimeout(connectionTimeout);
    });
  }

  /**
   * Listener can optionally return any data (Even promises) and a reply will be sent to the client
   * @returns Unsubscribe function
   */
  public subscribe(event: string, callback: (data: unknown, raw: WebSocketMessage) => any) {
    this.eventSubscribers.set(event, [...(this.eventSubscribers.get(event) || []), callback]);

    // Return unsubscribe function
    return () => {
      const listeners = this.eventSubscribers.get(event);
      if (!listeners) return;

      this.eventSubscribers.set(
        event,
        listeners.filter(l => l !== callback)
      );
    };
  }

  public sendEvent(event: string, payload: any, expectReply: true): Promise<unknown>;
  public sendEvent(event: string, payload?: any, expectReply?: false): void;

  /** Send the specified payload to the server optionally accepting a reply */
  public sendEvent(event: string, payload?: any, expectReply: boolean = false): void | Promise<unknown> {
    if (this.readyState !== WebSocket.OPEN) throw new Error('Not connected');
    const data: WebSocketMessage = { event, payload };

    if (!expectReply) {
      this.send(JSON.stringify(data));
      return;
    }

    return new Promise<unknown>((resolve, reject) => {
      const id = Math.random().toString(36).substring(2) + Date.now().toString(36);
      let msgTimeout: number | null = null;

      const unsubscribe = this.subscribe('_ALL', (payload, rawMsg) => {
        if (rawMsg.replyTo !== id) return;
        if (msgTimeout) clearTimeout(msgTimeout);
        unsubscribe();

        if (rawMsg.error) reject(payload);
        else resolve(payload);
      });

      msgTimeout = setTimeout(() => {
        unsubscribe();
        reject({
          error: true,
          payload: 'Request timed out'
        });
      }, 30_000);

      data.replyTo = id;
      this.send(JSON.stringify(data));
    });
  }
}

const connect = async (url: string, options: IWebsocketOptions, setWs: React.Dispatch<React.SetStateAction<WebSocketWrapper | null>>) => {
  let lastPing = Date.now();
  let pingTimer: number | null = null;
  let ws: WebSocketWrapper | null = new WebSocketWrapper(url, options.maxPayload);

  setWs(ws);

  ws.subscribe('ping', () => {
    lastPing = Date.now();
    ws?.sendEvent('pong');
  });

  ws.addEventListener('close', async () => {
    ws?.close();
    ws = null;
    setWs(null);
    if (pingTimer) clearInterval(pingTimer); // Will be re-set on re-connect

    await new Promise(resolve => setTimeout(resolve, options.reconnectDelay));
    connect(url, options, setWs);
  });

  pingTimer = setInterval(() => {
    if (!ws || Date.now() - lastPing < options.pingInterval * 2) return;

    ws.close(3008, 'Timed out');
  }, 300);
};

let setup = false;

const setupOnce = async (url: string, options: Partial<IWebsocketOptions>, setWs: React.Dispatch<React.SetStateAction<WebSocketWrapper | null>>) => {
  if (setup) return;

  if (!options.reconnectDelay) options.reconnectDelay = 1500;
  if (!options.pingInterval) options.pingInterval = DEFAULT_PING_INTERVAL;

  setup = true;
  connect(url, options as IWebsocketOptions, setWs);
};

// React side

interface IWebsocketContext {
  setupWebsocket: (url: string, options?: IWebsocketOptions) => void;
  websocket: WebSocketWrapper | null;
}

export const WebsocketContext = createContext<IWebsocketContext | undefined>(undefined);

export const WebsocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [websocket, setWebsocket] = useState<WebSocketWrapper | null>(null);

  const setupWebsocket = (url: string, options: Partial<IWebsocketOptions> = {}) => {
    setupOnce(url, options, setWebsocket);
  };

  return <WebsocketContext.Provider value={{ websocket, setupWebsocket }}>{children}</WebsocketContext.Provider>;
};

export const useWebsocket = () => {
  const context = useContext(WebsocketContext);
  if (!context) throw new Error('useWebsocket must be used within a WebsocketProvider');

  return context;
};
