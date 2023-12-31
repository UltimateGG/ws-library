import { logError, logWarn } from '@ultimategg/logging';
import http from 'http';
import https from 'https';
import { WebSocket, WebSocketServer } from 'ws';


type HttpServer = http.Server | https.Server;

export type AuthFunction = (req: http.IncomingMessage, ipAddress: string) => Promise<any>;

export declare class WebSocketWrapper extends WebSocket {
  ip: string;
  user: any;

  /** Internal use for connection drop check */
  isAlive: boolean;
}

/**
 * E = Your event enum
 * V = Your event data type or any
 */
export interface WebSocketMessage<E = string, V = any> {
  event: E;
  data: V;
}

export declare class WebSocketServerWrapper extends WebSocketServer {
  on(event: 'connection', listener: (ws: WebSocketWrapper, req: http.IncomingMessage, user: any) => void): this;
  on(event: 'message', listener: (ws: WebSocketWrapper, message: WebSocketMessage) => void): this;
  on(event: string, listener: (...args: any[]) => void): this;

  /** Broadcast the message to all clients (Except ones listed in the arguments/array) */
  broadcast(message: WebSocketMessage, ...ws: WebSocketWrapper[]): void;
}

export class WebSocketServerWrapperImpl extends WebSocketServer {
  public broadcast(message: WebSocketMessage, ...exclude: WebSocketWrapper[]) {
    this.clients.forEach(client => {
      const clientExt = client as WebSocketWrapper;

      if (clientExt.readyState === WebSocket.OPEN && !exclude.includes(clientExt))
        client.send(JSON.stringify(message));
    });
  }
}

const wss: WebSocketServerWrapper = new WebSocketServerWrapperImpl({ noServer: true });

/**
 * @param authFunc Should return the user, or null if not authenticated
 * @param path Path to listen for websocket connections on Ex '/ws'
 * @param pingInterval Terminate connection if no pong received in this interval (ms)
 */
const init = (server: HttpServer, authFunc: AuthFunction, path?: string, pingInterval: number = 30_000): WebSocketServerWrapper => {
  server.on('upgrade', async (req, socket, head) => {
    if (path && !req.url?.startsWith(path)) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      return socket.destroy();
    }
    
    const ipAddr = req.socket.remoteAddress || req.headers['x-forwarded-for']?.toString(); // TODO: On reverse proxy we might need the header first
    if (!ipAddr) {
      logWarn('[WebSocketLibrary] Could not get remote IP address from upgrade request');
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      return socket.destroy();
    }

    const user = await authFunc(req, ipAddr);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }

    // Successful authentication, upgrade to websocket
    wss.handleUpgrade(req, socket, head, (ws) => {
      const wsWrapper = ws as WebSocketWrapper;

      wsWrapper.ip = ipAddr;
      wsWrapper.user = user;

      wss.emit('connection', ws, req, user);
    });
  });

  wss.on('connection', ws => {
    const wsExt = ws as WebSocketWrapper;
    wsExt.on('pong', function() {
      (this as WebSocketWrapper).isAlive = true;
    });

    wsExt.isAlive = true;

    wsExt.on('message', async msg => {
      try {
        const json = JSON.parse(msg.toString());
        if (!json.event || !json.data)
          throw new Error('Invalid websocket message');

        // Emit message event with parsed json
        wss.emit('message', wsExt, json as WebSocketMessage);
      } catch (e) {
        logError('[WebSocketLibrary] Error parsing websocket message', e);
      }
    });
  });

  setInterval(() => {
    wss.clients.forEach(ws => {
      const clientExt = ws as WebSocketWrapper;
      if (clientExt.isAlive === false) return clientExt.terminate();
  
      clientExt.isAlive = false;
      clientExt.ping();
    });
  }, pingInterval);

  return wss;
};

export { wss };
export default init;
