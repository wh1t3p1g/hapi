import { fileURLToPath } from 'node:url';
import type { ClientRequestArgs } from 'node:http';
import * as WsRuntime from 'hapi-ws';

export type WsWebSocketOptions = ClientRequestArgs & {
    handshakeTimeout?: number;
    maxPayload?: number;
    perMessageDeflate?: boolean;
};
type WsMessageData = Buffer | ArrayBuffer | Buffer[];
export interface WebSocket {
    readonly readyState: number;
    readonly url: string;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'message', listener: (data: WsMessageData) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: 'error', listener: (error: Error) => void): this;
    once(event: 'message', listener: (data: WsMessageData) => void): this;
    once(event: 'open', listener: () => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    send(data: string, callback?: (error?: Error) => void): void;
    close(code?: number, reason?: string): void;
    terminate(): void;
}
type WebSocketConstructor = {
    new (endpoint: string, options?: WsWebSocketOptions): WebSocket;
    OPEN: number;
};
const WsModule = WsRuntime as unknown as {
    WebSocket: WebSocketConstructor;
    WebSocketServer: new (options?: Record<string, unknown>) => WebSocketServer;
};
export const WebSocket = WsModule.WebSocket;
export interface WebSocketServer {
    handleUpgrade(request: unknown, socket: unknown, head: Buffer, callback: (client: WebSocket) => void): void;
    emit(event: 'connection', client: WebSocket): boolean;
    on(event: 'connection', listener: (client: WebSocket) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: 'connection', listener: (client: WebSocket) => void): this;
    once(event: 'listening', listener: () => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    address(): { port: number } | string | null;
    clients: Set<WebSocket>;
    close(callback?: () => void): void;
}
export const WebSocketServer = WsModule.WebSocketServer;

export function isBunGlobalWebSocket(): boolean {
    return WebSocket === (globalThis as { WebSocket?: unknown }).WebSocket;
}

export function openUnixWebSocket(path: string, options?: WsWebSocketOptions): WebSocket {
    const socketPath = path.startsWith('file://') ? fileURLToPath(path) : path;
    return new WebSocket(`ws+unix://${socketPath}:/`, options);
}

export function openWebSocket(endpoint: string, options?: WsWebSocketOptions): WebSocket {
    return endpoint.startsWith('unix://') ? openUnixWebSocket(endpoint.slice(7), options) : new WebSocket(endpoint, options);
}
