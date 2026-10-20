# Wittgenstein training image.
#
# Reproducible base for the three Phase-1 subprograms (tokenizer/, adapter/,
# llm-head/). The image is meant for GPU hosts; CPU-only builds will start
# but training will be unusably slow.
#
# Build:
#   docker build -t wittgenstein-training:dev -f research/training/Dockerfile .
#
# Run (single-host, all GPUs):
#   docker run --gpus all -it --rm \
#     -v "$PWD":/workspace \
#     -w /workspace/research/training \
#     wittgenstein-training:dev

FROM nvcr.io/nvidia/pytorch:24.08-py3

# System deps for HF datasets + dvc + manifest-spine tooling.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git git-lfs curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

WORKDIR /workspace

# Python deps installed on top of the NGC PyTorch base. We intentionally
# do NOT pin torch here — the base image owns that. The training stack
# requirements skip torch via the `>=` floor.
# Caveat: requirements.txt's `torch>=2.6.0` floor targets the venv/CPU path; against this
# 24.08 base (torch ~2.4) it is unsatisfied and `pip install -r` would pull a PyPI torch over NGC.
COPY research/training/requirements.txt /tmp/training-requirements.txt
RUN pip install --no-cache-dir -r /tmp/training-requirements.txt

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/workspace/.cache/huggingface \
    TRANSFORMERS_CACHE=/workspace/.cache/huggingface \
    AIM_REPO=/workspace/.aim

# Wittgenstein harness is mounted at runtime, not baked into the image,
# so the same image runs against any harness git SHA.
RUN useradd --create-home --uid 1000 --shell /bin/bash trainuser \
    && mkdir -p /workspace/.cache/huggingface /workspace/.aim \
    && chown -R trainuser:trainuser /workspace /home/trainuser

USER trainuser

CMD ["bash"]
