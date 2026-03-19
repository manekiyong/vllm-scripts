const fs = require('fs');
const path = require('path');
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = 5000;
const ENDPOINTS_FILE = process.env.ROUTER_ENDPOINTS_FILE || path.join(__dirname, 'endpoints.txt');

// Middleware
app.use(cors({
    origin: '*',
    credentials: false
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Global State
let modelServerMap = {};
let modelCatalogue = { object: 'list', data: [] };

function parseEndpointLine(line) {
    const [rawUrl, rawToken] = line.split(/\s+/, 2);
    const url = (rawUrl || '').replace(/\/+$/, '');
    const token = rawToken ? rawToken.replace(/^\[/, '').replace(/\]$/, '') : null;

    if (!url) {
        return null;
    }

    return { url, token };
}

function formatAuthorizationHeader(token) {
    if (!token) {
        return null;
    }

    return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

function loadAddressesToCheck() {
    try {
        const fileContents = fs.readFileSync(ENDPOINTS_FILE, 'utf8');
        const endpoints = fileContents
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'))
            .map(parseEndpointLine)
            .filter(Boolean);

        console.log(`Loaded ${endpoints.length} endpoint(s) from ${ENDPOINTS_FILE}`);
        return endpoints;
    } catch (error) {
        console.error(`Failed to read endpoints file ${ENDPOINTS_FILE}: ${error.message}`);
        return [];
    }
}

const addressToCheck = loadAddressesToCheck();

// Helper to update the server map
async function updateServerMap() {
    console.log("Updating server map...");
    const validModelMap = {};
    const compiledCatalogue = [];
    const seenModels = new Set();

    // We use Promise.allSettled to check all servers in parallel/non-blocking way
    const checks = addressToCheck.map(async (endpoint) => {
        try {
            const response = await axios.get(`${endpoint.url}/v1/models`, {
                timeout: 5000,
                headers: endpoint.token
                    ? { authorization: formatAuthorizationHeader(endpoint.token) }
                    : undefined,
            });
            if (response.status === 200 && response.data && Array.isArray(response.data.data)) {
                response.data.data.forEach((modelEntry) => {
                    if (!modelEntry || !modelEntry.id) {
                        return;
                    }

                    validModelMap[modelEntry.id] = endpoint;

                    if (!seenModels.has(modelEntry.id)) {
                        seenModels.add(modelEntry.id);
                        compiledCatalogue.push(modelEntry);
                    }
                });
            }
        } catch (error) {
            // Ignore errors as per original script (just continue)
        }
    });

    await Promise.all(checks);
    modelServerMap = validModelMap;
    modelCatalogue = {
        object: 'list',
        data: compiledCatalogue,
    };
    console.log(`Updated map: ${JSON.stringify(
        Object.fromEntries(
            Object.entries(modelServerMap).map(([model, endpoint]) => [model, endpoint.url])
        )
    )}`);
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

app.get('/v1/models', async (req, res) => {
    await updateServerMap();
    res.json(modelCatalogue);
});

// Proxy Handler
app.all('/*', async (req, res) => {
    // Skip checking for the /available_models route as it is handled above, 
    // but express matching handles that priority naturally.
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

    const computeUrl = `${computeServer.url}${urlPath}`;
    console.log(`Query from: ${req.ip} Routing to ${computeServer.url}; Model: ${modelName}`);

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
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
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
