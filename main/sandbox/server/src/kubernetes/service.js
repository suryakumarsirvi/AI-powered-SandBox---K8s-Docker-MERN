import k8sCoreApi from "./config.js";

export async function createService(sandboxId) {
    const serviceManifest = {
        metadata: {
            name: `sandbox-service-${sandboxId}`,
            labels: {
                sandboxId: sandboxId
            }
        },
        spec: {
            selector: {
                sandboxId: sandboxId
            },
            ports: [
                {
                    protocol: "TCP",
                    port: 80,
                    targetPort: 5173
                }
            ]
        }
    };

    try {
        console.log(`[K8s Orchestration] Spawning Service sandbox-service-${sandboxId}...`);
        const response = await k8sCoreApi.createNamespacedService({
            namespace: "default",
            body: serviceManifest
        });
        return response.body;
    } catch (err) {
        console.error(`[K8s Error] Failed to create Service sandbox-service-${sandboxId}:`, err);
        throw err;
    }
}

export async function deleteService(sandboxId) {
    try {
        console.log(`[K8s Orchestration] Deleting Service sandbox-service-${sandboxId}...`);
        await k8sCoreApi.deleteNamespacedService({
            name: `sandbox-service-${sandboxId}`,
            namespace: "default"
        });
    } catch (err) {
        // Log error but proceed (service may already be deleted)
        console.warn(`[K8s Warning] Could not delete Service sandbox-service-${sandboxId} (might be already gone):`, err.message);
    }
}