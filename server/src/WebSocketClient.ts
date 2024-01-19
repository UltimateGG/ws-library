import WebSocket from 'ws';
import { WebSocketMessage } from './WebSocketServer';


/** 
 * @template T Your user type
 * @template D Your custom data type (optional)
 * 
 * Both are null by default. If a user is connected they will not be null
 */
export default class WebSocketClient<T = any, D = any> extends WebSocket {
  public ip?: string;
  public user: T = null as any;
  public data: D = null as any;

  /** Internal use for connection drop check */
  public isAlive?: boolean;

  /** Fire an event for this client */
  public sendEvent(event: string, data?: WebSocketMessage) {
    super.send(JSON.stringify({ event, data }));
  }
}
