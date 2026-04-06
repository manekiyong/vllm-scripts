vllm serve google/gemma-4-26B-A4B-it \
  --max-model-len 131072 \
  --enable-auto-tool-choice \
  --reasoning-parser gemma4 \
  --tool-call-parser gemma4