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
```

## Client Side Example

```tsx
import { useEffect } from 'react';
import { useWebsocket } from '@ultimategg/ws-client';

enum Event {
  HELLO = 'hello',
  TEST = 'test'
}

const App = () => {
  const { websocket, setupWebsocket } = useWebsocket();

  useEffect(() => {
    setupWebsocket('ws://localhost:3000/'); // Only needed to call once in your app
  }, []);

  useEffect(() => {
    const unsubscribe = websocket?.subscribe(Event.HELLO, async () => {
      console.log('Received Hello event');
      await new Promise(resolve => setTimeout(resolve, 1_000));

      return 'Hello, World!';
    });

    return unsubscribe;
  }, [websocket]);

  const test = async () => {
    if (!websocket) return; // Not connected
    const res = await websocket?.sendEvent(Event.TEST, 25, true);

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
