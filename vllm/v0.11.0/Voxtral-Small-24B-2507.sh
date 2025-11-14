vllm serve /models/huggingface/mistralai/Voxtral-Small-24B-2507 \
    --tokenizer_mode mistral \
    --config_format mistral \
    --load_format mistral \
    --tensor-parallel-size 2 \
    --tool-call-parser mistral \
    --enable-auto-tool-choice \
    --served_model_name Voxtral-Small-24B-2507