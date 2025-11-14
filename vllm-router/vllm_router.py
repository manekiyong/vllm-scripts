from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
import asyncio
import uvicorn
import logging
from urllib.parse import urljoin
import requests
import json
import datetime
import threading
import time
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)

logging.basicConfig(
    filename='app.log', 
    filemode='a', 
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(name)s - %(message)s'
)

logger = logging.getLogger(__name__)

stop_event = threading.Event()
scheduler_thread = None

# Example model-to-server mapping
model_server_map = {
}

address_to_check = [
    'http://workstation1:port/',
    'http://workstation2:port/',
]

async def update_server_map():
    global model_server_map
    try:
        valid_model_map = {}
        for link in address_to_check:
            try:
                r = requests.get(f"{link}/v1/models")
                if r.status_code == 200:
                    model = r.json()['data'][0]['id']
                    valid_model_map[model] = link
            except:
                continue
        model_server_map = valid_model_map
        logger.info(f"Updated map: {model_server_map}")
        return

    except Exception as e:
        logger.error(f"Failed to update map: {e}")
        return

def scheduler_loop(loop):
    INTERVAL = 10 * 60  # 1 minutes

    while not stop_event.is_set():
        # Sleep in small intervals so shutdown is responsive
        for _ in range(int(INTERVAL)):
            if stop_event.is_set():
                return
            time.sleep(1)
        asyncio.run_coroutine_threadsafe(update_server_map(), loop)

@app.on_event("startup")
async def start_scheduler():
    global scheduler_thread
    await update_server_map()
    loop = asyncio.get_event_loop()
    scheduler_thread = threading.Thread(
        target=scheduler_loop, args=(loop,), daemon=True
    )
    scheduler_thread.start()


@app.on_event("shutdown")
async def shutdown_event():
    print(">>> Shutdown initiated. Stopping scheduler thread...")
    stop_event.set()              # <--- Signal thread to stop
    scheduler_thread.join()       # <--- Wait for it to exit
    print(">>> Scheduler stopped cleanly")

def get_compute_server(model_name: str):
    # Fallback logic if model not found
    # Defaults to the model hosted in the link in address_to_check list
    global model_server_map
    return model_server_map.get(model_name, address_to_check[0])

@app.api_route("/available_models", methods=["GET"])
async def available_models():
    global model_server_map
    await update_server_map()
    return {"available_models":list(model_server_map.keys())}

@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy(request: Request, full_path: str):
    method = request.method
    url_path = f"/{full_path}"
    headers = dict(request.headers)
    params = dict(request.query_params)
    body = await request.body()
    is_stream = False
    print((body))
    model_name = None
    if method in ("POST", "PUT", "PATCH"):
        try:
            body_json = json.loads(body)
            model_name = body_json.get("model")
            is_stream = bool(body_json.get("stream", False))
        except Exception:
            model_name = params.get("model")
    else:
        model_name = params.get("model")

    compute_server = get_compute_server(model_name)
    compute_url = compute_server + url_path
    headers.pop("host", None)
    logger.info(f"Query from: {request.client.host} Routing to {compute_server}; Model: {model_name}")

    async with httpx.AsyncClient(timeout=None) as client:
        if is_stream:
            # Get status code and headers first
            async with client.stream(method, compute_url, headers=headers, content=body, params=params) as resp_probe:
                status_code = resp_probe.status_code
                probe_headers = dict(resp_probe.headers)
            # Stream actual response
            async def response_body_generator():
                async with httpx.AsyncClient(timeout=None) as stream_client:
                    async with stream_client.stream(method, compute_url, headers=headers, content=body, params=params) as resp:
                        async for chunk in resp.aiter_bytes():
                            yield chunk 
            return StreamingResponse(response_body_generator(), status_code=status_code, headers=probe_headers)
        # Non-stream
        resp = await client.request(method, compute_url, headers=headers, content=body, params=params)
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=resp.headers
        )
if __name__=="__main__":
    uvicorn.run("vllm_router:app", host='0.0.0.0', port=5000, reload=True)
