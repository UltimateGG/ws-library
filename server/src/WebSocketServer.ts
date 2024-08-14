import { ServerOptions as OriginalServerOptions, WebSocketServer as OriginalWebSocketServer, WebSocket } from 'ws';
import http from 'http';
import https from 'https';
import WebSocketClient from './WebSocketClient';
import { logError, logWarn } from '@ultimategg/logging';

/** Incoming or outgoing data, payload should be unwrapped before being exposed to consumer */
export interface WebSocketMessage {
  event: string;
  error?: boolean;
  replyTo?: string;
  ack?: boolean; // If the replyTo was the response
  payload?: unknown;
}

type InferUserType<T> = T extends typeof WebSocketClient<infer U> ? U : never;

export interface ServerOptions<ClientType extends typeof WebSocketClient<InferUserType<ClientType>>> extends OriginalServerOptions {
  /** pingInterval Terminate connection if no pong received in this interval (ms) */
  pingInterval?: number;

  WebSocket?: ClientType;
}

export class WebSocketServer<ClientType extends typeof WebSocketClient<InferUserType<ClientType>> = typeof WebSocketClient> extends OriginalWebSocketServer<ClientType> {
  private eventSubscribers: Map<string, ((data: unknown, ws: InstanceType<ClientType>, raw: WebSocketMessage) => any)[]> = new Map();

  /**
   * @param server Pass in your http or https server instance
   * @param authFunc Should return the user, or null if not authenticated
   * @param path Path to listen for websocket connections on Ex '/ws'
   */
  constructor(
    server: http.Server | https.Server,
    authFunc: (req: http.IncomingMessage, ipAddress: string) => Promise<InferUserType<ClientType> | null>,
    path?: string,
    options: ServerOptions<ClientType> = {}
  ) {
    super({
      ...options,
      noServer: true, // Required for our auth function
      WebSocket: options.WebSocket || (WebSocketClient as any) // Use custom client
    });

    // Authentication/connection handler
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
      this.handleUpgrade(req, socket, head, client => {
        client.ip = ipAddr;
        client.user = user;

        this.emit('connection', client);
      });
    });

    // Setup client listeners:
    // On message, fire server event
    // On close, fire disconnect event
    this.on('connection', client => {
      client._setServer(this);

      client.on('message', async msg => {
        try {
          const json = JSON.parse(msg.toString());
          if (!json?.event || typeof json.event !== 'string') throw new Error('Invalid websocket message');

          // Emit message event with parsed json
          this.emit('message', json, client);
        } catch (e) {
          logError('[WebSocketLibrary] Error parsing websocket message (Invalid JSON)', e);
        }
      });

      client.on('close', (code, reason) => {
        if (!client.isAlive && code === 1006) {
          code = 3008;
          reason = Buffer.from('Timed out');
        }

        this.emit('disconnect', client, code, reason.toString());
      });
    });

    // Ping clients to check if they are still connected
    setInterval(() => {
      this.clients.forEach(client => {
        if (!client.isAlive) return client.terminate();

        client.isAlive = false;
        client.sendEvent('ping');
      });
    }, options.pingInterval || 30_000);

    // Listen to any client pongs and mark them as alive
    this.subscribe('pong', (_, client) => (client.isAlive = true));

    // Setup message subscriber handler
    this.on('message', (data: WebSocketMessage, client: InstanceType<ClientType>) => {
      const listeners = [...(this.eventSubscribers.get(data.event) || []), ...(this.eventSubscribers.get('_ALL') || [])];
      if (!listeners) return;

      listeners.forEach(async listener => {
        const replyTo = data.replyTo;
        const shouldReply = replyTo !== undefined && !data.ack;

        try {
          let replyMsg = listener(data.payload, client, data); // Fire message event

          if (replyMsg instanceof Promise) replyMsg = await replyMsg; // Await promise if it's async

          // If the client wants a reply and there is data to reply with, send it
          if (shouldReply && replyMsg) client.send(JSON.stringify({ event: data.event, replyTo, ack: true, payload: replyMsg } satisfies WebSocketMessage));
        } catch (e) {
          logError(`[WebSocketLibrary] Caught error calling event subscriber for "${data.event}"`, e);

          // If they were expecting a reply and we errored, let them know
          if (shouldReply) client.send(JSON.stringify({ event: data.event, replyTo, error: true, ack: true, payload: (e as any).message || 'Unknown error' } satisfies WebSocketMessage));
        }
      });
    });
  }

  /**
   * Send a message to all connected clients
   *
   * @param event Event name/enum
   * @param payload Custom payload
   * @param exclude Users to exclude from broadcast
   */
  public broadcast(event: string, payload: any, ...exclude: InstanceType<ClientType>[]) {
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN && !exclude.includes(client)) client.sendEvent(event, payload);
    });
  }

  /**
   * Listener can optionally return any data (Even promises) and a reply will be sent to the client
   */
  public subscribe(event: string, listener: (data: unknown, client: InstanceType<ClientType>, raw: WebSocketMessage) => any): () => void {
    this.eventSubscribers.set(event, [...(this.eventSubscribers.get(event) || []), listener]);

    // Return unsubscribe function
    return () => {
      const listeners = this.eventSubscribers.get(event);
      if (!listeners) return;

      this.eventSubscribers.set(
        event,
        listeners.filter(l => l !== listener)
      );
    };
  }
}