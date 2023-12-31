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
  logInfo('New connection from ' + req.socket.remoteAddress);
});

wss.subscribe<number>(Event.TEST, (message, client) => {
  logInfo('TEST EVENT:', message);
});

wss.on('disconnect', (client) => {
  logInfo('Client disconnected');
});


server.listen(3000, () => {
  logInfo('Server listening on port 3000!');
});
