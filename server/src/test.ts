import http from 'http';
import express from 'express';
import { WebSocketClient, WebSocketServer } from './index';
import { logError, logInfo } from '@ultimategg/logging';

const app = express();
const server = http.createServer(app);

interface CustomUser {
  id: number;
  name: string;
}

enum Event {
  HELLO = 'hello',
  TEST = 'test'
}

const wss = new WebSocketServer<typeof WebSocketClient<CustomUser>>(
  server,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async (req, ipAddr) => {
    // Authenticate using cookies, param, etc.
    // and return your user object or null (explicit) to reject the connection

    return {
      id: Date.now(),
      name: ['John', 'Jane', 'Bob', 'Alice'][Math.floor(Math.random() * 4)]
    };
  },
  {
    path: '/api/ws'
  }
);

wss.on('connection', async client => {
  logInfo('New connection from ' + client.user.name);

  const r = await client.sendEvent(Event.HELLO, null, true).catch(logError);

  console.log(r);
});

wss.subscribe(Event.TEST, async data => {
  logInfo('TEST EVENT:', data);

  await new Promise(resolve => setTimeout(resolve, 1_000));

  return '[test string]';
});

wss.on('disconnect', (client, _code, reason) => {
  logInfo(client.user.name + ' disconnected' + (reason ? ` (${reason})` : ''));
});

server.listen(3000, () => {
  logInfo('Server listening on port 3000!');
});
