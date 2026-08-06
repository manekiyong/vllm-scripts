
pip install "vllm[audio]" && \
vllm serve /models/huggingface/google/gemma-4-12B-it \
    --served_model_name gemma-4-12B-it \
    --tensor-parallel-size 2 \
    --max-model-len 65536 \
    --enable-auto-tool-choice \
    --tool-call-parser gemma4 \
    --gpu_memory_utilization 0.94 \
    --chat-template examples/tool_chat_template_gemma4.jinja \
    --reasoning-parser gemma4