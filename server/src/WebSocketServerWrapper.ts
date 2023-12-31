import { logError } from '@ultimategg/logging';
import { ServerOptions, WebSocketServer } from 'ws';
import { WebSocketClient } from '.';


export class WebSocketServerWrapper extends WebSocketServer {
  private eventSubscibers: Map<string, ((data: any, ws: WebSocketClient) => void)[]> = new Map();


  constructor(options?: ServerOptions, callback?: () => void) {
    super(options, callback);

    this.on('message', (event: string, data: any, ws: WebSocketClient) => {
      const wsExt = ws as WebSocketClient;

      const listeners = this.eventSubscibers.get(event);
      if (!listeners) return;

      listeners.forEach(listener => {
        try {
          listener(data, wsExt);
        } catch (e) {
          logError(`[WebSocketLibrary] Caught error while calling event subscriber for "${event}"`, e);
        }
      });
    });

    this.subscribe('pong', (data, ws) => ws.isAlive = true);
  }

  public broadcast(event: string, data: any, ...exclude: WebSocketClient[]) {
    this.clients.forEach(client => {
      const clientExt = client as WebSocketClient;

      if (clientExt.readyState === WebSocket.OPEN && !exclude.includes(clientExt))
        client.send(JSON.stringify({ event, data }));
    });
  }

  public subscribe<E = any>(event: string, listener: (data: E, ws: WebSocketClient) => void): this {
    this.eventSubscibers.set(event, [...(this.eventSubscibers.get(event) || []), listener]);
    return this;
  }
}
