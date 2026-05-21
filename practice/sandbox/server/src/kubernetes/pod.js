import k8sCoreApi from './config.js';

export const createPod = async(sandboxId)=>{
    const podManifest = {
        metadata: {
            name: `sandbox-pod-${sandboxId}`,
            labels: {
                sandboxId: sandboxId
            }
        },
        spec: {
            containers: [
                {
                    image: 'sandbox-template:latest',
                    name: 'sandbox-container',
                    ports: [
                        {
                            containerPort: 5173,
                            protocol: 'TCP',
                            name: 'sandbox-port'
                        }
                    ],
                    resources: {
                        limits: {
                            cpu: '500m',
                            memory: '1Gi'
                        },
                        requests: {
                            cpu: '250m',
                            memory: '512Mi'
                        }
                    }
                }
            ]
        }
    };

    const response = await k8sCoreApi.createNamespacedPod({
        namespace: 'default',
        body: podManifest
    });

    return response.body
}