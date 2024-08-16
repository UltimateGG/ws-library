import { ServerOptions as OriginalServerOptions, WebSocketServer as OriginalWebSocketServer, WebSocket } from 'ws';
import http from 'http';
import https from 'https';
import WebSocketClient from './WebSocketClient';
import { logError, logWarn } from '@ultimategg/logging';
import type stream from 'stream';

/** Incoming or outgoing data, payload should be unwrapped before being exposed to consumer */
export interface WebSocketMessage {
  event: string;
  error?: boolean;
  replyTo?: string;
  ack?: boolean; // If the replyTo was the response
  payload?: unknown;
}

type InferUserType<T> = T extends typeof WebSocketClient<infer U> ? U : never;

/** maxPayload default is 5000 bytes */
export interface ServerOptions<ClientType extends typeof WebSocketClient<InferUserType<ClientType>>> extends Omit<OriginalServerOptions, 'server' | 'verifyClient'> {
  /** pingInterval Terminate connection if no pong received in this interval (ms) */
  pingInterval?: number;

  /** Set to true if you need multiple WS on one server, then call onUpgrade */
  manualUpgrade?: boolean;

  WebSocket?: ClientType;
}

export class WebSocketServer<ClientType extends typeof WebSocketClient<InferUserType<ClientType>> = typeof WebSocketClient> extends OriginalWebSocketServer<ClientType> {
  private eventSubscribers: Map<string, ((data: unknown, ws: InstanceType<ClientType>, raw: WebSocketMessage) => any)[]> = new Map();
  private upgradeHandler: (req: http.IncomingMessage, socket: stream.Duplex, head: Buffer) => void;

  /**
   * @param server Pass in your http or https server instance
   * @param authFunc Should return the user, or null if not authenticated
   */
  constructor(server: http.Server | https.Server, authFunc: (req: http.IncomingMessage, ipAddress: string) => Promise<InferUserType<ClientType> | null>, options: ServerOptions<ClientType> = {}) {
    if (!options.maxPayload) options.maxPayload = 5000;

    super({
      ...options,
      noServer: true, // Required for our auth function
      WebSocket: options.WebSocket || (WebSocketClient as any) // Use custom client
    });

    this.upgradeHandler = async (req: http.IncomingMessage, socket: stream.Duplex, head: Buffer) => {
      if (options.path && !req.url?.startsWith(options.path)) {
        socket.write(`HTTP/${req.httpVersion} 404 Not Found\r\n\r\n`);
        return socket.destroy();
      }

      const ipAddr = req.socket.remoteAddress || req.headers['x-forwarded-for']?.toString(); // TODO: On reverse proxy we might need the header first
      if (!ipAddr) {
        logWarn('[WebSocketLibrary] Could not get remote IP address from upgrade request');
        socket.write(`HTTP/${req.httpVersion} 400 Bad Request\r\n\r\n`);
        return socket.destroy();
      }

      const user = await authFunc(req, ipAddr).catch(() => null);
      if (!user) {
        socket.write(`HTTP/${req.httpVersion} 401 Unauthorized\r\n\r\n`);
        return socket.destroy();
      }

      // Successful authentication, upgrade to websocket
      this.handleUpgrade(req, socket, head, client => {
        client.ip = ipAddr;
        client.user = user;

        this.emit('connection', client);
      });
    };

    // Authentication/connection handler
    if (!options.manualUpgrade) server.on('upgrade', this.upgradeHandler);

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
          this.emit('messageRaw', json, client);
        } catch (e) {
          // We can just ignore it, what can they do?
          logError('[WebSocketLibrary] Error parsing raw websocket message', e);
        }
      });

      client.on('error', e => {
        logError('[WebSocketLibrary] Client error', e);
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
    this.on('messageRaw', (data, client) => {
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

  public onUpgrade(req: http.IncomingMessage, socket: stream.Duplex, head: Buffer) {
    this.upgradeHandler(req, socket, head);
  }

  // Override event emitter to allow for custom events
  // Yes its horrible but it works and Typescript overloads are stupid
  on(event: 'connection', cb: (this: WebSocketServer<ClientType>, client: InstanceType<ClientType>, request: http.IncomingMessage) => void): this;
  on(event: 'error', cb: (this: WebSocketServer<ClientType>, error: Error) => void): this;
  on(event: 'headers', cb: (this: WebSocketServer<ClientType>, headers: string[], request: http.IncomingMessage) => void): this;
  on(event: 'close' | 'listening', cb: (this: WebSocketServer<ClientType>) => void): this;
  on(event: 'messageRaw', cb: (this: WebSocketServer<ClientType>, data: WebSocketMessage, client: InstanceType<ClientType>) => void): this;
  on(event: 'disconnect', cb: (this: WebSocketServer<ClientType>, client: InstanceType<ClientType>, code: number, reason: string) => void): this;
  on(event: string | symbol, listener: (this: WebSocketServer<ClientType>, ...args: any[]) => void): this;
  on(event: string | symbol, listener: (this: WebSocketServer<ClientType>, ...args: any[]) => void): this {
    return super.on(event as any, listener as any);
  }

  once(event: 'connection', cb: (this: WebSocketServer<ClientType>, client: InstanceType<ClientType>, request: http.IncomingMessage) => void): this;
  once(event: 'error', cb: (this: WebSocketServer<ClientType>, error: Error) => void): this;
  once(event: 'headers', cb: (this: WebSocketServer<ClientType>, headers: string[], request: http.IncomingMessage) => void): this;
  once(event: 'close' | 'listening', cb: (this: WebSocketServer<ClientType>) => void): this;
  once(event: 'messageRaw', cb: (this: WebSocketServer<ClientType>, data: WebSocketMessage, client: InstanceType<ClientType>) => void): this;
  once(event: 'disconnect', cb: (this: WebSocketServer<ClientType>, client: InstanceType<ClientType>, code: number, reason: string) => void): this;
  once(event: string | symbol, listener: (this: WebSocketServer<ClientType>, ...args: any[]) => void): this;
  once(event: string | symbol, listener: (this: WebSocketServer<ClientType>, ...args: any[]) => void): this {
    return super.once(event as any, listener as any);
  }

  off(event: 'connection', cb: (this: WebSocketServer<ClientType>, client: InstanceType<ClientType>, request: http.IncomingMessage) => void): this;
  off(event: 'error', cb: (this: WebSocketServer<ClientType>, error: Error) => void): this;
  off(event: 'headers', cb: (this: WebSocketServer<ClientType>, headers: string[], request: http.IncomingMessage) => void): this;
  off(event: 'close' | 'listening', cb: (this: WebSocketServer<ClientType>) => void): this;
  off(event: 'messageRaw', cb: (this: WebSocketServer<ClientType>, data: WebSocketMessage, client: InstanceType<ClientType>) => void): this;
  off(event: 'disconnect', cb: (this: WebSocketServer<ClientType>, client: InstanceType<ClientType>, code: number, reason: string) => void): this;
  off(event: string | symbol, listener: (this: WebSocketServer<ClientType>, ...args: any[]) => void): this;
  off(event: string | symbol, listener: (this: WebSocketServer<ClientType>, ...args: any[]) => void): this {
    return super.off(event as any, listener as any);
  }

  addListener(event: 'connection', cb: (client: InstanceType<ClientType>, request: http.IncomingMessage) => void): this;
  addListener(event: 'error', cb: (err: Error) => void): this;
  addListener(event: 'headers', cb: (headers: string[], request: http.IncomingMessage) => void): this;
  addListener(event: 'close' | 'listening', cb: () => void): this;
  addListener(event: 'messageRaw', cb: (data: WebSocketMessage, client: InstanceType<ClientType>) => void): this;
  addListener(event: 'disconnect', cb: (client: InstanceType<ClientType>, code: number, reason: string) => void): this;
  addListener(event: string | symbol, listener: (...args: any[]) => void): this;
  addListener(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.addListener(event as any, listener as any);
  }

  removeListener(event: 'connection', cb: (client: InstanceType<ClientType>, request: http.IncomingMessage) => void): this;
  removeListener(event: 'error', cb: (err: Error) => void): this;
  removeListener(event: 'headers', cb: (headers: string[], request: http.IncomingMessage) => void): this;
  removeListener(event: 'close' | 'listening', cb: () => void): this;
  removeListener(event: 'messageRaw', cb: (data: WebSocketMessage, client: InstanceType<ClientType>) => void): this;
  removeListener(event: 'disconnect', cb: (client: InstanceType<ClientType>, code: number, reason: string) => void): this;
  removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
  removeListener(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.removeListener(event as any, listener as any);
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
   * @returns Unsubscribe function
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
