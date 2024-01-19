import http from 'http';
import express from 'express';
import { WebSocketServer } from './index';
import { logInfo } from '@ultimategg/logging';


const app = express();
const server = http.createServer(app);

interface CustomUser {
  id: number;
  name: string;
}

enum Event {
  TEST = 'test',
}

const wss = new WebSocketServer<CustomUser>(server, async (req, ipAddr) => { // eslint-disable-line @typescript-eslint/no-unused-vars
  // Authenticate using cookies, param, etc.
  // and return your user object or null to reject the connection

  return {
    id: Date.now(),
    name: ['John', 'Jane', 'Bob', 'Alice'][Math.floor(Math.random() * 4)],
  };
});

wss.on('connection', client => {
  logInfo('New connection from ' + client.user.name);
});

wss.subscribe<number>(Event.TEST, async message => {
  logInfo('TEST EVENT:', message.payload);

  await new Promise(resolve => setTimeout(resolve, 1_000));
  return '[test string]';
});

wss.on('disconnect', client => {
  logInfo(client.user.name + ' disconnected');
});


server.listen(3000, () => {
  logInfo('Server listening on port 3000!');
});
