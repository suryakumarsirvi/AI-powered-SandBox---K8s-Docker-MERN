import express from 'express';
import morgan from 'morgan';
import { createPod, deletePod, getPodStatus } from './kubernetes/pod.js';
import { createService, deleteService } from './kubernetes/service.js';
import { v7 as uuid } from "uuid";
import { redis, subscriber } from './config/redis.js';

const app = express();

app.use(morgan('dev'));
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Hello from Sandbox Server Orchestrator!');
});

app.get("/_status/healthz", (req, res) => {
    res.status(200).json({ status: "ok" });
});

app.get("/_status/readyz", (req, res) => {
    res.status(200).json({ status: "ok" });
});

// Create and start a sandbox container + service
app.post("/api/sandbox/start", async (req, res) => {
    const sandboxId = uuid();
    
    try {
        console.log(`[Orchestrator] Starting sandbox allocation for ID: ${sandboxId}`);
        
        // Spin up resources in Kubernetes
        await createPod(sandboxId);
        await createService(sandboxId);

        // Save session lease with 5-minute initial TTL (sliding lease)
        const sessionKey = `sandbox:${sandboxId}`;
        await redis.set(sessionKey, "active", "EX", 60 * 5);

        res.status(201).json({
            status: "success",
            message: "Sandbox environment created successfully",
            sandboxId,
            previewUrl: `${sandboxId}.preview.localhost`
        });
    } catch (err: any) {
        console.error(`[Orchestrator Error] Failed to launch sandbox ${sandboxId}:`, err);
        
        // Compensating transactions - attempt deletion of half-baked resources
        await deletePod(sandboxId).catch(() => {});
        await deleteService(sandboxId).catch(() => {});

        res.status(500).json({
            error: "Failed to allocate sandbox resources",
            message: err.message
        });
    }
});

// Retrieve container phase and readiness state
app.get("/api/sandbox/status/:sandboxId", async (req, res) => {
    const { sandboxId } = req.params;
    try {
        const status = await getPodStatus(sandboxId);
        res.status(200).json({
            sandboxId,
            ...status
        });
    } catch (err: any) {
        res.status(500).json({
            error: "Failed to retrieve sandbox status",
            message: err.message
        });
    }
});

// Stop and delete sandbox resources manually
app.post("/api/sandbox/stop/:sandboxId", async (req, res) => {
    const { sandboxId } = req.params;
    try {
        console.log(`[Orchestrator] Stopping sandbox ${sandboxId} manually`);
        await redis.del(`sandbox:${sandboxId}`);
        await deletePod(sandboxId);
        await deleteService(sandboxId);
        res.status(200).json({
            status: "success",
            message: "Sandbox environment stopped successfully"
        });
    } catch (err: any) {
        res.status(500).json({
            error: "Failed to stop sandbox",
            message: err.message
        });
    }
});

// Background Cleanup Listener (triggered when Redis session lease expires)
subscriber.on("message", async (channel, key) => {
    try {
        const parts = key.split(":");
        if (parts[0] !== 'sandbox' || !parts[1]) return;
        
        const sandboxId = parts[1];
        console.log(`[Orchestrator Cleanup] Session expired for sandbox ${sandboxId}. Cleaning up Kubernetes resources...`);
        
        await deletePod(sandboxId);
        await deleteService(sandboxId);
    } catch (err: any) {
        console.error("[Orchestrator Cleanup Error] Expiry handler failed:", err.message);
    }
});

export default app;