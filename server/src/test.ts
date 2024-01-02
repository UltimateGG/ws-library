import http from 'http';
import express from 'express';
import websocketServer from '.';
import { logInfo } from '@ultimategg/logging';


const app = express();
const server = http.createServer(app);

const wss = websocketServer(server, async (req, ipAddr) => {
  // Authenticate using cookies, param, etc.
  // and return your user object (Or SOMETHING not null)

  return true;
});

enum Event {
  TEST = 'test',
}

wss.on('connection', (client, req) => {
  logInfo('New connection from ' + client.ip);
});

wss.subscribe<number>(Event.TEST, async (message, client) => {
  logInfo('TEST EVENT:', message.payload);

  await new Promise(resolve => setTimeout(resolve, 1_000));
  return '[test string]';
});

wss.on('disconnect', (client) => {
  logInfo('Client disconnected');
});


server.listen(3000, () => {
  logInfo('Server listening on port 3000!');
});
