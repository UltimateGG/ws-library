import WebSocket from 'ws';
import { WebSocketMessage } from './WebSocketServerWrapper';


export default class WebSocketClient extends WebSocket {
  ip?: string;
  user: any;

  /** Internal use for connection drop check */
  isAlive?: boolean;

  public sendEvent(event: string, data?: WebSocketMessage) {
    super.send(JSON.stringify({ event, data }));
  }
}
