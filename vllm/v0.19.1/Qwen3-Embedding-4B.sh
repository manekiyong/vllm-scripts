vllm serve /models/huggingface/Qwen/Qwen3-Embedding-4B \
    --served_model_name Qwen3-Embedding-4B \
    --runner pooling \
    --tensor_parallel_size 1 \

