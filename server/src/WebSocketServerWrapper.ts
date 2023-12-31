import { logError } from '@ultimategg/logging';
import { ServerOptions, WebSocketServer, WebSocket } from 'ws';
import WebSocketClient from './WebSocketClient';


export class WebSocketServerWrapper extends WebSocketServer<typeof WebSocketClient> {
  private eventSubscibers: Map<string, ((data: any, ws: WebSocketClient) => void)[]> = new Map();


  constructor(options?: ServerOptions<typeof WebSocketClient>, callback?: () => void) {
    super({ ...options, WebSocket: WebSocketClient }, callback);

    this.on('message', (event: string, data: any, client: WebSocketClient) => {
      const listeners = this.eventSubscibers.get(event);
      if (!listeners) return;

      listeners.forEach(listener => {
        try {
          listener(data, client);
        } catch (e) {
          logError(`[WebSocketLibrary] Caught error while calling event subscriber for "${event}"`, e);
        }
      });
    });
  }

  public broadcast(event: string, data: any, ...exclude: WebSocketClient[]) {
    this.clients.forEach(client => {
      const clientExt = client as WebSocketClient;

      if (clientExt.readyState === WebSocket.OPEN && !exclude.includes(clientExt))
        client.send(event, data);
    });
  }

  public subscribe<E = any>(event: string, listener: (data: E, client: WebSocketClient) => void): this {
    this.eventSubscibers.set(event, [...(this.eventSubscibers.get(event) || []), listener]);
    return this;
  }
}
