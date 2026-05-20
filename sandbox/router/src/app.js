import express from 'express';
import {createProxyMiddleware} from 'http-proxy-middleware';
const app = express();

app.use((req, res, next)=>{
    const host = req.host;
    const uuid = host.split('.')[0];
    const serviceName = `http://sandbox-service-${uuid}`

    return createProxyMiddleware({
        changeOrigin: true
    })
    next();
});

export default app;