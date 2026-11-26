# Wittgenstein training image.
#
# Candidate environment template, not a qualified or locked GPU image.
# tokenizer/ has an entrypoint; adapter/ and llm-head/ remain placeholders.
# Qualify the resolved environment on the target GPU before a real run.
#
# Build:
#   docker build -t wittgenstein-training:dev -f research/training/Dockerfile .
#
# Run (single-host, all GPUs):
#   docker run --gpus all -it --rm \
#     -v "$PWD":/workspace \
#     -w /workspace \
#     wittgenstein-training:dev

FROM nvcr.io/nvidia/pytorch:24.08-py3

# System deps for HF datasets + dvc + manifest-spine tooling.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git git-lfs curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install

WORKDIR /workspace

# These open requirements can replace the base image's PyTorch/CUDA stack.
# A tag alone is not reproducibility: retain the built image digest and a
# resolved pip freeze, run pip check, then qualify the target hardware.
# See docs/contributing/training-setup.md; no current image is blessed here.
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
