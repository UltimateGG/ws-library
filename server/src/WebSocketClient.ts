import WebSocket from 'ws';
import { WebSocketMessage } from './WebSocketServer';
import { ClientRequestArgs } from 'http';

/**
 * @template U Your user object type
 */
export default class WebSocketClient<U = any> extends WebSocket {
  public user!: U;
  public ip!: string;

  /** Internal use for connection drop check */
  public isAlive: boolean;

  constructor(address: unknown);

  constructor(address: string | URL, protocols?: string | string[], options?: WebSocket.ClientOptions | ClientRequestArgs) {
    super(address, protocols, options);

    this.isAlive = true;
  }

  /** Send an event to this client */
  public sendEvent(event: string, data: WebSocketMessage = {}) {
    super.send(JSON.stringify({ event, data }));
  }
}
