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

export class WebSocketWrapper extends WebSocket {
  public pingInterval: number;

  private readonly eventSubscribers: Map<string, ((data: unknown, raw: WebSocketMessage) => any)[]> = new Map();

  constructor(url: string, protocols?: string | string[], pingInterval = DEFAULT_PING_INTERVAL) {
    super(url, protocols);

    this.pingInterval = pingInterval;

    const connectionTimeout = setTimeout(() => {
      if (this.readyState !== WebSocket.CONNECTING) return;
      this.close();
    }, 10_000);

    this.addEventListener('open', () => {
      clearTimeout(connectionTimeout);
    });

    this.addEventListener('message', msg => {
      try {
        const data = JSON.parse(msg.data.toString());

        const listeners = [...(this.eventSubscribers.get(data.event) || []), ...(this.eventSubscribers.get('_ALL') || [])];
        if (!listeners) return;

        listeners.forEach(async listener => {
          const replyTo = data.replyTo;
          const shouldReply = replyTo !== undefined && !data.ack;

          try {
            let replyMsg = listener(data.payload, data); // Fire message event

            if (replyMsg instanceof Promise) replyMsg = await replyMsg; // Await promise if it's async

            // If the client wants a reply and there is data to reply with, send it
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

export interface IWebsocketOptions {
  url: string;
  reconnectDelay: number;
  pingInterval: number;
}

const connect = async (options: IWebsocketOptions, setWs: React.Dispatch<React.SetStateAction<WebSocketWrapper | null>>) => {
  let lastPing = Date.now();
  let pingInterval: number | null = null;
  let ws: WebSocketWrapper | null = new WebSocketWrapper(options.url, undefined, options.pingInterval);

  setWs(ws);

  ws.subscribe('ping', () => {
    lastPing = Date.now();
    ws?.sendEvent('pong');
  });

  ws.addEventListener('close', async () => {
    ws?.close();
    ws = null;
    setWs(null);
    if (pingInterval) clearInterval(pingInterval); // Will be re-set on re-connect

    await new Promise(resolve => setTimeout(resolve, options.reconnectDelay));
    connect(options, setWs);
  });

  pingInterval = setInterval(() => {
    if (Date.now() - lastPing < options.pingInterval * 2) return;

    ws?.onclose && ws.onclose(new CloseEvent('timeout'));
    ws?.close();
  }, 300);
};

let setup = false;

const setupOnce = async (options: IWebsocketOptions, setWs: React.Dispatch<React.SetStateAction<WebSocketWrapper | null>>) => {
  if (setup) return;

  setup = true;
  connect(options, setWs);
};

// React side

interface IWebsocketContext {
  setupWebsocket: (url: string, reconnectDelay?: number, pingInterval?: number) => void;
  websocket: WebSocketWrapper | null;
}

export const WebsocketContext = createContext<IWebsocketContext | undefined>(undefined);

export const WebsocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [websocket, setWebsocket] = useState<WebSocketWrapper | null>(null);

  const setupWebsocket = (url: string, reconnectDelay = 1500, pingInterval = DEFAULT_PING_INTERVAL) => {
    setupOnce({ url, reconnectDelay, pingInterval }, setWebsocket);
  };

  return <WebsocketContext.Provider value={{ websocket, setupWebsocket }}>{children}</WebsocketContext.Provider>;
};

export const useWebsocket = () => {
  const context = useContext(WebsocketContext);
  if (!context) throw new Error('useWebsocket must be used within a WebsocketProvider');

  return context;
};
