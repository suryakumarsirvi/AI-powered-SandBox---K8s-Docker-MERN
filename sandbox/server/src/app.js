import express from 'express';
import morgan from 'morgan';
import {v7 as uuid} from 'uuid';
import { createPod } from './kubernetes/pod.js';
import { createService } from './kubernetes/service.js';

const app = express();
app.use(morgan('dev'));

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.post('/api/sandbox/start', async(req, res)=>{
    const sandboxId = uuid();

    await createPod(sandboxId);
    await createService(sandboxId);

    res.status(201).json({
        message: "Sandbox environment created successfully",
        sandboxId,
        preview: `${sandboxId}.preview.localhost`
    });
})

export default app;