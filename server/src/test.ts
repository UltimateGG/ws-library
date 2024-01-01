import http from 'http';
import express from 'express';
import websocketServer from '.';
import { logInfo } from '@ultimategg/logging';


const app = express();
const server = http.createServer(app);

const wss = websocketServer(server, async (req, ipAddr) => {
  return true;
});

enum Event {
  TEST = 'test',
}

wss.on('connection', (client, req) => {
  logInfo('New connection from ' + client.ip);
});

wss.subscribe<number>(Event.TEST, (message, client) => { // TODO fix with async
  logInfo('TEST EVENT:', message.payload);

  // await new Promise(resolve => setTimeout(resolve, 1000));

  return '[test string]';
});

wss.on('disconnect', (client) => {
  logInfo('Client disconnected');
});


server.listen(3000, () => {
  logInfo('Server listening on port 3000!');
});
