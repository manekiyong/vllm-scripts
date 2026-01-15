const express = require('express');
const axios = require('axios');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors({
    origin: '*',
    credentials: false
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global State
let modelServerMap = {};

// Addresses to check (hardcoded as per original script)
const addressToCheck = [
    'http://workstation1:port',
    'http://workstation2:port',
];

// Helper to update the server map
async function updateServerMap() {
    console.log("Updating server map...");
    const validModelMap = {};
    
    // We use Promise.allSettled to check all servers in parallel/non-blocking way
    const checks = addressToCheck.map(async (link) => {
        try {
            const response = await axios.get(`${link.replace(/\/+$/, '')}/v1/models`, { timeout: 5000 });
            if (response.status === 200 && response.data && response.data.data && response.data.data.length > 0) {
                const model = response.data.data[0].id;
                validModelMap[model] = link;
            }
        } catch (error) {
            // Ignore errors as per original script (just continue)
        }
    });

    await Promise.all(checks);
    modelServerMap = validModelMap;
    console.log(`Updated map: ${JSON.stringify(modelServerMap)}`);
}

// Scheduler: Update map every 10 minutes
// The original script uses 10 * 60 seconds.
const INTERVAL = 10 * 60 * 1000; 
setInterval(updateServerMap, INTERVAL);

// Initial update on startup
updateServerMap();

function getComputeServer(modelName) {
    return modelServerMap[modelName];
}

// Routes

app.get('/available_models', async (req, res) => {
    await updateServerMap();
    console.log("### Executing /available_model")
    res.json({ available_models: Object.keys(modelServerMap) });
});

// Proxy Handler
app.all('/*', async (req, res) => {
    // Skip checking for the /available_models route as it is handled above, 
    // but express matching handles that priority naturally.
    console.log("### Executing /*")
    const method = req.method;
    const urlPath = req.originalUrl; // keeps query params
    const headers = { ...req.headers };
    delete headers.host; // Remove host header to avoid conflicts
    delete headers['content-length']; // Let axios handle this

    let modelName = null;
    let isStream = false;

    // Extract model name
    // 1. From Query Params
    if (req.query.model) {
        modelName = req.query.model;
    }
    
    // 2. From Body (if POST/PUT/PATCH)
    if (['POST', 'PUT', 'PATCH'].includes(method) && req.body) {
        if (req.body.model) {
            modelName = req.body.model;
        }
        if (req.body.stream) {
            isStream = Boolean(req.body.stream);
        }
    }

    const computeServer = getComputeServer(modelName);

    if (!computeServer) {
        console.log(`Query from: ${req.ip} Failed to find model: ${modelName}`);
        return res.status(404).json({ detail: `Model ${modelName} not found` });
    }

    const computeUrl = `${computeServer.replace(/\/+$/, '')}${urlPath}`;
    console.log(`Query from: ${req.ip} Routing to ${computeServer}; Model: ${modelName}`);

    try {
        const axiosConfig = {
            method: method,
            url: computeUrl,
            headers: headers,
            params: req.query, // axios handles params, but they are also in urlPath usually? 
                               // req.originalUrl includes params. If we append urlPath to host, we duplicate params if we also pass params object?
                               // Let's rely on constructing the full URL cleanly.
                               // Actually, req.originalUrl DOES contain query string. 
                               // So we should NOT pass `params: req.query` if we use `${computeServer}${req.originalUrl}`.
            data: req.body,
            responseType: isStream ? 'stream' : 'json',
            validateStatus: () => true, // resolve promise for all status codes
        };

        // Adjust URL construction:
        // computeServer might be "http://host:port"
        // urlPath is "/v1/chat/completions?foo=bar"
        // Target: "http://host:port/v1/chat/completions?foo=bar"
        // So we don't pass `params` to axios configuration to avoid duplication.
        // HOWEVER, we need to pass data.

        const response = await axios({
            ...axiosConfig,
            url: computeUrl, // Using constructed URL with query params
            params: undefined, // Explicitly undefined
        });

        // Forward status and headers
        res.status(response.status);
        Object.keys(response.headers).forEach(key => {
            res.setHeader(key, response.headers[key]);
        });

        if (isStream) {
            response.data.pipe(res);
        } else {
            res.send(response.data);
        }

    } catch (error) {
        console.error(`Proxy error: ${error.message}`);
        // If the error comes from Axios request failure (network, etc)
        if (!res.headersSent) {
            res.status(502).json({ detail: "Bad Gateway / Upstream Error" });
        }
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
