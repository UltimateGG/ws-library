import http from 'http';
import express, { Request, Response } from 'express';
import websocketServer from '.';
import { logInfo } from '@ultimategg/logging';


const app = express();
const server = http.createServer(app);

const wss = websocketServer(server, async (req, ipAddr) => {
  logInfo('Request from ' + ipAddr);
});

app.get('/', (req: Request, res: Response) => {
  res.send('Hello World!');
});

server.listen(3000, () => {
  console.log('Server listening on port 3000!');
});
