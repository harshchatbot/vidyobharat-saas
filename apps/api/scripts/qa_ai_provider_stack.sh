#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")/.."

./venv/bin/python -m py_compile \
  app/core/config.py \
  app/services/llm/base.py \
  app/services/llm/qwen_service.py \
  app/services/llm/providers/mock_qwen_provider.py \
  app/services/llm/providers/hf_qwen_provider.py \
  app/services/llm/providers/self_hosted_qwen_provider.py \
  app/services/video/base.py \
  app/services/video/ltx_service.py \
  app/services/video/providers/mock_ltx_provider.py \
  app/services/video/providers/hf_ltx_provider.py \
  app/services/video/providers/self_hosted_ltx_provider.py \
  app/services/ltx_video_service.py \
  app/services/ai_video_service.py \
  app/pipeline/pipeline_engine.py \
  app/api/routes.py

./venv/bin/python -m pytest \
  tests/test_qwen_service.py \
  tests/test_video_provider_services.py \
  tests/test_ltx_video_service.py \
  tests/test_ltx_scene_plan.py
