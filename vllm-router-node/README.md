```bash
docker build -t vllm-router-node:v0.0.1 .
```

The router can read endpoints from a mounted file in [`src/index.js`](./src/index.js).

Set `ROUTER_ENDPOINTS_FILE` to a file with one endpoint per line:

```text
http://workstation1:8000 [api-token]
http://workstation2:8000 [api-token]
```

The token is optional. If present, the router sends it upstream as `Authorization: Bearer <token>` when checking `/v1/models`. This token is not forwarded to the models and the users are expected to provide them when wanting to use the models. Samples are provided in [`endpoints.txt.sample`](./build/endpoints.txt.sample)

The router exposes its own compiled `GET /v1/models` endpoint. On refresh, it queries every configured upstream `/v1/models`, stores the backend endpoint and token for routing, and returns a merged OpenAI-style model catalog.

The included Compose file mounts [`build/endpoints.txt`](./build/endpoints.txt) into the container:

```bash
cd build
docker compose up
```

For Kubernetes, the same pattern works well with a ConfigMap. Update the ConfigMap, then restart the pod or rollout so the router reads the new file on startup.
