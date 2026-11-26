import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isBunGlobalWebSocket, openUnixWebSocket, WebSocket, WebSocketServer } from './websocket';

describe('Unix WebSocket transport', () => {
    it('uses the ws implementation for Unix sockets', () => {
        expect(isBunGlobalWebSocket()).toBe(false);
    });

    it('connects to a Unix socket instead of Bun global WebSocket', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'hapi-unix-websocket-'));
        const path = join(directory, 'engine.sock');
        const server = createServer();
        const websocket = new WebSocketServer({ noServer: true });
        server.on('upgrade', (request, socket, head) => websocket.handleUpgrade(request, socket, head, client => websocket.emit('connection', client)));
        const listening = new Promise<void>(resolve => server.listen(path, resolve));
        await listening;
        const realSocket = openUnixWebSocket(path);
        const opened = new Promise<void>(resolve => realSocket.once('open', resolve));
        const failed = new Promise<never>((_, reject) => realSocket.once('error', reject));
        const messages = new Promise<void>(resolve => websocket.once('connection', client => {
            client.send('unix-ok');
            resolve();
        }));
        const received = new Promise<string>(resolve => realSocket.once('message', data => resolve(data.toString())));
        try {
            expect(realSocket).toBeInstanceOf(WebSocket);
            expect(realSocket.url).toBe(`ws+unix://${path}:/`);
            await Promise.race([opened, failed]);
            await messages;
            await expect(received).resolves.toBe('unix-ok');
        } finally {
            realSocket.terminate();
            websocket.close();
            await new Promise<void>(resolve => server.close(() => resolve()));
            await rm(directory, { recursive: true, force: true });
        }
    });
});
