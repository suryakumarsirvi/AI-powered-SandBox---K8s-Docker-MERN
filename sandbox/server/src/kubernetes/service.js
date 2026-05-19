import k8sCoreApi from "./config.js";

export const createService = async (sandboxId) =>{
    const serviceManifest = {
        metadata: {
            name: `${sandboxId}-sandbox-service`,
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
                    protocol: 'TCP',
                    port: 80,
                    targetPort: 5173
                }
            ]
        }
    }

    const response = await k8sCoreApi.createNamespacedService({
        namespace: 'default',
        body: serviceManifest
    });

    return response.body;
}