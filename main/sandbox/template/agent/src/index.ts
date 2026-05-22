import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as path from 'path';
import { 
    getDirTree, 
    writeFileContent, 
    readFileContent, 
    deletePath 
} from './filesystem.js';
import { TerminalManager } from './terminal.js';

const app = express();
app.use(express.json());

const PORT = process.env.AGENT_PORT ? parseInt(process.env.AGENT_PORT, 10) : 5173;
const WORKSPACE_DIR = path.resolve(process.env.WORKSPACE_DIR || '/workspace');

const terminalManager = new TerminalManager(WORKSPACE_DIR);

// Health check endpoint
app.get('/_status/healthz', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// File System REST APIs (useful fallback and setup)
app.get('/api/fs', async (req, res) => {
    try {
        const tree = await getDirTree(WORKSPACE_DIR);
        res.json(tree);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/fs/read', async (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) {
        return res.status(400).json({ error: 'Missing path parameter' });
    }
    try {
        const content = await readFileContent(WORKSPACE_DIR, filePath);
        res.json({ content });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/fs/write', async (req, res) => {
    const { filePath, content } = req.body;
    if (!filePath || content === undefined) {
        return res.status(400).json({ error: 'Missing filePath or content' });
    }
    try {
        await writeFileContent(WORKSPACE_DIR, filePath, content);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/fs/delete', async (req, res) => {
    const filePath = req.query.path as string;
    if (!filePath) {
        return res.status(400).json({ error: 'Missing path parameter' });
    }
    try {
        await deletePath(WORKSPACE_DIR, filePath);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Mapping to keep track of active sockets and their spawned terminals
const socketTerminals = new Map<WebSocket, Set<string>>();

wss.on('connection', (ws: WebSocket) => {
    socketTerminals.set(ws, new Set<string>());

    ws.on('message', async (message: string) => {
        try {
            const data = JSON.parse(message);
            const { action, payload } = data;

            if (!action) {
                return ws.send(JSON.stringify({ action: 'error', payload: { message: 'Missing action field' } }));
            }

            switch (action) {
                case 'term:start': {
                    const terminalId = payload.terminalId || 'default';
                    const cols = payload.cols || 80;
                    const rows = payload.rows || 24;
                    
                    // Track this terminal for cleanup on socket disconnect
                    socketTerminals.get(ws)?.add(terminalId);
                    
                    terminalManager.spawn(terminalId, ws, cols, rows);
                    break;
                }

                case 'term:input': {
                    const terminalId = payload.terminalId || 'default';
                    terminalManager.write(terminalId, payload.data);
                    break;
                }

                case 'term:resize': {
                    const terminalId = payload.terminalId || 'default';
                    terminalManager.resize(terminalId, payload.cols, payload.rows);
                    break;
                }

                case 'file:write': {
                    const { filePath, content } = payload;
                    await writeFileContent(WORKSPACE_DIR, filePath, content);
                    ws.send(JSON.stringify({ 
                        action: 'file:write:success', 
                        payload: { filePath } 
                    }));
                    break;
                }

                case 'file:read': {
                    const { filePath } = payload;
                    const content = await readFileContent(WORKSPACE_DIR, filePath);
                    ws.send(JSON.stringify({ 
                        action: 'file:read:success', 
                        payload: { filePath, content } 
                    }));
                    break;
                }

                case 'file:delete': {
                    const { filePath } = payload;
                    await deletePath(WORKSPACE_DIR, filePath);
                    ws.send(JSON.stringify({ 
                        action: 'file:delete:success', 
                        payload: { filePath } 
                    }));
                    break;
                }

                case 'ping': {
                    ws.send(JSON.stringify({ action: 'pong' }));
                    break;
                }

                default:
                    ws.send(JSON.stringify({ 
                        action: 'error', 
                        payload: { message: `Unknown action: ${action}` } 
                    }));
            }
        } catch (err: any) {
            console.error('WS Message error:', err);
            ws.send(JSON.stringify({ 
                action: 'error', 
                payload: { message: err.message || 'Invalid JSON message' } 
            }));
        }
    });

    ws.on('close', () => {
        const terminals = socketTerminals.get(ws);
        if (terminals) {
            for (const terminalId of terminals) {
                terminalManager.kill(terminalId);
            }
            socketTerminals.delete(ws);
        }
    });
});

// Upgrade WebSocket connections cleanly
server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
    
    // Support either general ws connection or _agent prefix
    if (pathname === '/_agent/ws' || pathname === '/ws' || pathname === '/') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

// Clean shut-down of all sub-processes
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Cleaning active terminal processes...');
    terminalManager.killAll();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Cleaning active terminal processes...');
    terminalManager.killAll();
    process.exit(0);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Sandbox Agent listening on 0.0.0.0:${PORT}`);
});
