/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { createContext, useContext, useState } from 'react';


const DEFAULT_PING_INTERVAL = 30_000;

export interface WebSocketMessage<T = any> {
  error?: boolean;
  replyTo?: string;
  payload?: T;
}

export class WebSocketWrapper extends WebSocket {
  public pingInterval: number;

  private readonly eventSubscribers: Map<string, ((data: WebSocketMessage) => void)[]> = new Map();


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
        const json = JSON.parse(msg.data.toString());
  
        const listeners = [...(this.eventSubscribers.get(json.event) || []), ...(this.eventSubscribers.get('_ALL') || [])];
        if (!listeners) return;
  
        listeners.forEach(listener => {
          try {
            listener(json.data);
          } catch (e) {
            console.error(`Caught error calling event subscriber for "${json.event}"`, e);
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

  public subscribe<T>(event: string, callback: (data: WebSocketMessage<T>) => void) {
    this.eventSubscribers.set(event, [...(this.eventSubscribers.get(event) || []), callback]);
  
    return () => { // Return unsubscribe function
      const listeners = this.eventSubscribers.get(event);
      if (!listeners) return;
  
      this.eventSubscribers.set(event, listeners.filter(l => l !== callback));
    };
  }

  /** Send the specified payload to the server optionally accepting a reply */
  public async sendEvent(event: string, payload?: any, expectReply: boolean = false) {
    return new Promise<WebSocketMessage>((resolve, reject) => {
      if (this.readyState !== WebSocket.OPEN)
        return reject({ error: true, message: 'Not connected' });
  
      if (!expectReply) {
        this.send(JSON.stringify({ event, data: { payload } }));
        return resolve({});
      }

      const id = Math.random().toString(36).substring(2) + Date.now().toString(36);
      let msgTimeout: number | null = null;

      const unsubscribe = this.subscribe('_ALL', dataIn => {
        if (dataIn.replyTo !== id) return;
        if (msgTimeout) clearTimeout(msgTimeout);
        unsubscribe();

        delete dataIn.replyTo;
        if (dataIn.error) reject(dataIn);
        else resolve(dataIn);
      });

      msgTimeout = setTimeout(() => {
        unsubscribe();
        reject({
          error: true,
          message: 'Request timed out',
        });
      }, 30_000);

      this.send(JSON.stringify({ event, data: { replyTo: id, payload }}));
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
  setupWebsocket: (url: string, ssl?: boolean, reconnectDelay?: number, pingInterval?: number) => void;
  websocket: WebSocketWrapper | null;
}

export const WebsocketContext = createContext<IWebsocketContext | undefined>(undefined);

export const WebsocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [websocket, setWebsocket] = useState<WebSocketWrapper | null>(null);


  const setupWebsocket = (url: string, ssl: boolean = true, reconnectDelay = 1500, pingInterval = DEFAULT_PING_INTERVAL) => {
    setupOnce({ url: `ws${ssl ? 's' : ''}://${url}`, reconnectDelay, pingInterval }, setWebsocket);
  };

  return (
    <WebsocketContext.Provider value={{ websocket, setupWebsocket }}>
      {children}
    </WebsocketContext.Provider>
  );
};

export const useWebsocket = () => {
  const context = useContext(WebsocketContext);
  if (!context) throw new Error('useWebsocket must be used within a WebsocketProvider');

  return context;
};
