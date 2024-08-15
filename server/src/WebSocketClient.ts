import WebSocket from 'ws';
import { WebSocketMessage, WebSocketServer } from './WebSocketServer';
import { ClientRequestArgs } from 'http';

/**
 * @template U Your user object type
 */
export default class WebSocketClient<U = any> extends WebSocket {
  public user!: U;
  public ip!: string;
  private server!: WebSocketServer<any>;

  /** Internal use for connection drop check */
  public isAlive: boolean;

  constructor(address: unknown);
  constructor(address: string | URL, protocols?: string | string[], options?: WebSocket.ClientOptions | ClientRequestArgs);

  constructor(address: string | URL, protocols?: string | string[], options?: WebSocket.ClientOptions | ClientRequestArgs) {
    super(address, protocols, options);

    this.isAlive = true;
  }

  public _setServer(server: WebSocketServer<any>) {
    this.server = server;
  }

  public sendEvent(event: string, payload: any, expectReply: true): Promise<unknown>;
  public sendEvent(event: string, payload?: any, expectReply?: false): void;

  /** Send an event to this client */
  public sendEvent(event: string, payload?: any, expectReply: boolean = false): Promise<unknown> | void {
    const data: WebSocketMessage = { event, payload };

    if (!expectReply) {
      super.send(JSON.stringify(data));
      return;
    }

    return new Promise<unknown>((resolve, reject) => {
      const id = Math.random().toString(36).substring(2) + Date.now().toString(36);
      let msgTimeout: NodeJS.Timeout | null = null;

      const unsubscribe = this.server.subscribe('_ALL', (payload, _c, rawMsg) => {
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
