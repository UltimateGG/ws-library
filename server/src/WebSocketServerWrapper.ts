import { logError } from '@ultimategg/logging';
import { ServerOptions, WebSocketServer, WebSocket } from 'ws';
import WebSocketClient from './WebSocketClient';


export interface WebSocketMessage<T = any> {
  error?: boolean;
  replyTo?: string;
  payload?: T;
}

export class WebSocketServerWrapper extends WebSocketServer<typeof WebSocketClient> {
  private eventSubscibers: Map<string, ((data: WebSocketMessage, ws: WebSocketClient) => any)[]> = new Map();


  constructor(options?: ServerOptions<typeof WebSocketClient>, callback?: () => void) {
    super({ ...options, WebSocket: WebSocketClient }, callback);

    this.on('message', (event: string, data: WebSocketMessage, client: WebSocketClient) => {
      const listeners = this.eventSubscibers.get(event);
      if (!listeners) return;

      listeners.forEach(async listener => {
        const replyTo = data?.replyTo;

        try {
          let replyMsg: any;

          // Fire message event
          if (listener.constructor.name === 'AsyncFunction') replyMsg = await listener(data, client);
          else replyMsg = listener(data, client);

          // If the client wants a reply and there is data to reply with, send it
          if (replyTo && replyMsg) client.sendEvent(event, { replyTo, payload: replyMsg });
        } catch (e) {
          logError(`[WebSocketLibrary] Caught error while calling event subscriber for "${event}"`, e);

          // If they were expecting a reply and we errored, let them know
          if (replyTo) client.sendEvent(event, { replyTo, error: true, payload: (e as any).message || 'Unknown error' });
        }
      });
    });
  }

  public broadcast(event: string, payload: any, ...exclude: WebSocketClient[]) {
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && !exclude.includes(client))
        client.sendEvent(event, { payload });
    });
  }

  /** Listener can optionally return data and a reply will be sent to the client */
  public subscribe<T = any>(event: string, listener: (data: WebSocketMessage<T>, client: WebSocketClient) => any): this {
    this.eventSubscibers.set(event, [...(this.eventSubscibers.get(event) || []), listener]);
    return this;
  }
}
