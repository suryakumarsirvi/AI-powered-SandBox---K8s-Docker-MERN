import express from 'express';
import { createProxyMiddleware } from "http-proxy-middleware";
import { createServer } from 'http';
import { createProxyServer } from 'httpxy';
import { redis } from './config/redis.js';

const app = express();

app.get("/_status/healthz", (req, res) => {
    res.status(200).json({ status: "ok" });
});

app.get("/_status/readyz", (req, res) => {
    res.status(200).json({ status: "ok" });
});

// Middleware to authorize and slide expiration lease
app.use(async (req, res, next) => {
    const host = req.headers.host || '';
    const uuid = host.split('.')[0];
    
    if (!uuid || uuid === 'router' || uuid === 'api') {
        return res.status(400).json({ error: "Invalid Sandbox Host" });
    }

    const sessionKey = `sandbox:${uuid}`;
    const exists = await redis.exists(sessionKey);
    
    if (!exists) {
        return res.status(404).json({ 
            error: "Sandbox expired or not found. Please start the sandbox again." 
        });
    }

    // Refresh the TTL for sliding expiration lease (extend by 5 minutes)
    await redis.expire(sessionKey, 60 * 5);

    // Dynamic service URL mapping (K8s local cluster DNS resolution)
    const targetService = `http://sandbox-service-${uuid}.default.svc.cluster.local`;

    console.log(`[Proxy Request] Proxying host ${host} to target ${targetService}`);

    return createProxyMiddleware({
        target: targetService,
        changeOrigin: true,
        ws: true,
        onError: (err, req, res) => {
            console.error(`[Proxy Error] Service ${targetService} unreachable:`, err.message);
            res.status(502).json({ 
                error: "Sandbox is currently boot-loading or unreachable. Please try again in a moment." 
            });
        }
    })(req, res, next);
});

const wsProxy = createProxyServer({
    changeOrigin: true,
});
const server = createServer(app);

// Handle WebSocket upgrade proxying
server.on('upgrade', async (req, socket, head) => {
    const host = req.headers.host || '';
    const uuid = host.split('.')[0];

    if (!uuid || uuid === 'router' || uuid === 'api') {
        socket.destroy();
        return;
    }

    const sessionKey = `sandbox:${uuid}`;
    const exists = await redis.exists(sessionKey);

    if (!exists) {
        console.warn(`[Proxy WS Upgrade Denied] Sandbox session ${uuid} has expired.`);
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
    }

    // Extend TTL on socket connection
    await redis.expire(sessionKey, 60 * 5);

    const targetService = `http://sandbox-service-${uuid}.default.svc.cluster.local`;
    console.log(`[Proxy WS Upgrade] Upgrading socket connection for ${uuid} to ${targetService}`);

    wsProxy.ws(req, socket, { target: targetService }, head)
        .catch((err) => {
            console.error(`[Proxy WS Error] Upgraded socket failed for ${targetService}:`, err.message);
            socket.destroy();
        });
});

export default app;
export { server };
