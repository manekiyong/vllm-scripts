vllm serve /models/huggingface/google/gemma-4-26B-A4B-it \
  --served_model_name gemma-4-26B-A4B-it \
  --max-model-len 65536 \
  --enable-auto-tool-choice \
  --reasoning-parser gemma4 \
  --tool-call-parser gemma4 \
  --tensor_parallel_size 2 \
  --seed 0 \
  --max_num_seqs 8 \
  --gpu_memory_utilization 0.88