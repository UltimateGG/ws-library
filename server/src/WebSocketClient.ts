import WebSocket from 'ws';


export default class WebSocketClient extends WebSocket {
  ip?: string;
  user: any;

  /** Internal use for connection drop check */
  isAlive?: boolean;

  public send(event: string, data?: any) {
    super.send(JSON.stringify({ event, data }));
  }
}
