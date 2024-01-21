# WS Library

WS Library provides a layer on top of the default WebSocket implementation, adding features such as connection drops, improved event handling, and event listeners.

## Features

- Connection drops: Handles connection drops and provides mechanisms to automatically reconnect
- Event handling: Simplifies event handling by providing a clean and intuitive API both client and server side
- Event listeners: Allows you to register event listeners for specific events and execute custom logic when those events occur

## Why

Without this library, websockets simply send either binary or string data. You would need to make a custom 
layer that would take in any data, parse it as JSON, and an entire event subscriber system to call X function for X event.


This library also has authentication support so you can assign a user to their websocket object, much like 
express middleware.


## Server Side Example
```typescript
import http from 'http';
import express from 'express';
import { WebSocketServer } from '@ultimategg/ws-server';


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
  console.log('New connection from ' + client.user.name);
});

wss.subscribe<number>(Event.TEST, async (message, client) => {
  console.log('TEST event from:', client.user.name, message.payload);

  await new Promise(resolve => setTimeout(resolve, 1_000));
  return '[test string]'; // Returns to that client specifically
});

wss.on('disconnect', client => {
  console.log(client.user.name + ' disconnected');
});


server.listen(3000, () => {
  console.log('Server listening on port 3000!');
});
```

## Client Side Example
```tsx
import { useEffect } from 'react';
import { useWebsocket } from '@ultimategg/ws-client';


const App = () => {
  const { websocket, setupWebsocket } = useWebsocket();


  useEffect(() => {
    setupWebsocket('ws://localhost:3000/'); // Only needed to call once in your app
  }, []);

  const test = async () => {
    if (!websocket) return; // Not connected
    const res = await websocket?.sendEvent('test', 25, true);

    console.log(res);
  };

  return (
    <div>
      <button onClick={() => test()}>Send Test</button>
    </div>
  );
};

export default App;
```
