import k8sCoreApi from "./config.js";

export async function createPod(sandboxId) {
    const podManifest = {
        metadata: {
            name: `sandbox-pod-${sandboxId}`,
            labels: {
                app: "sandbox-pod",
                sandboxId: sandboxId
            }
        },
        spec: {
            // runtimeClassName: "gvisor", // Uncomment in prod to enforce gVisor isolation
            securityContext: {
                runAsNonRoot: true,
                runAsUser: 1000,
                fsGroup: 1000
            },
            containers: [
                {
                    image: "template:latest",
                    name: "sandbox-container",
                    ports: [
                        {
                            containerPort: 5173,
                            protocol: "TCP",
                            name: "sandbox-port"
                        }
                    ],
                    securityContext: {
                        allowPrivilegeEscalation: false,
                        readOnlyRootFilesystem: false,
                        capabilities: {
                            drop: ["ALL"]
                        }
                    },
                    resources: {
                        limits: {
                            cpu: "500m",
                            memory: "1Gi",
                            "ephemeral-storage": "1Gi"
                        },
                        requests: {
                            cpu: "200m",
                            memory: "256Mi"
                        }
                    },
                    env: [
                        {
                            name: "WORKSPACE_DIR",
                            value: "/workspace"
                        },
                        {
                            name: "AGENT_PORT",
                            value: "5173"
                        }
                    ]
                }
            ]
        }
    };

    try {
        console.log(`[K8s Orchestration] Spawning Pod sandbox-pod-${sandboxId}...`);
        const response = await k8sCoreApi.createNamespacedPod({
            namespace: "default",
            body: podManifest
        });
        return response.body;
    } catch (err) {
        console.error(`[K8s Error] Failed to create Pod sandbox-pod-${sandboxId}:`, err);
        throw err;
    }
}

export async function getPodStatus(sandboxId) {
    try {
        const response = await k8sCoreApi.readNamespacedPod({
            name: `sandbox-pod-${sandboxId}`,
            namespace: "default"
        });
        const pod = response.body;
        const phase = pod.status?.phase || "Unknown"; // e.g. Pending, Running, Succeeded, Failed
        const ready = pod.status?.containerStatuses?.every(cs => cs.ready) || false;
        const ipAddress = pod.status?.podIP || "";
        
        return { phase, ready, ipAddress };
    } catch (err) {
        console.error(`[K8s Error] Failed to read Pod status for sandbox-pod-${sandboxId}:`, err.message);
        throw err;
    }
}

export async function deletePod(sandboxId) {
    try {
        console.log(`[K8s Orchestration] Deleting Pod sandbox-pod-${sandboxId}...`);
        await k8sCoreApi.deleteNamespacedPod({
            name: `sandbox-pod-${sandboxId}`,
            namespace: "default"
        });
    } catch (err) {
        console.warn(`[K8s Warning] Could not delete Pod sandbox-pod-${sandboxId} (might be already gone):`, err.message);
    }
}