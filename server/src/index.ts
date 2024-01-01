import { logError, logWarn } from '@ultimategg/logging';
import http from 'http';
import https from 'https';
import { WebSocketServerWrapper } from './WebSocketServerWrapper';


const wss: WebSocketServerWrapper = new WebSocketServerWrapper({ noServer: true });

/**
 * @param authFunc Should return the user, or null if not authenticated
 * @param path Path to listen for websocket connections on Ex '/ws'
 * @param pingInterval Terminate connection if no pong received in this interval (ms)
 */
const init = (
  server: http.Server | https.Server,
  authFunc: (req: http.IncomingMessage, ipAddress: string) => Promise<any>,
  path?: string,
  pingInterval: number = 30_000
): WebSocketServerWrapper => {
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
    wss.handleUpgrade(req, socket, head, (client) => {
      client.ip = ipAddr;
      client.user = user;

      wss.emit('connection', client, req);
    });
  });

  wss.on('connection', client => {
    client.on('message', async msg => {
      try {
        const json = JSON.parse(msg.toString());
        if (!json.event || typeof json.event !== 'string')
          throw new Error('Invalid websocket message');

        // Emit message event with parsed json
        wss.emit('message', json.event, json.data, client);
      } catch (e) {
        logError('[WebSocketLibrary] Error parsing websocket message', e);
      }
    });

    client.on('close', () => wss.emit('disconnect', client));
  });

  wss.subscribe('pong', (data, client) => client.isAlive = true);

  // Ping clients to check if they are still connected
  setInterval(() => {
    wss.clients.forEach(client => {
      if (client.isAlive === false) return client.terminate();
  
      client.isAlive = false;
      client.sendEvent('ping');
    });
  }, pingInterval);

  return wss;
};

export { wss, WebSocketServerWrapper };
export default init;
