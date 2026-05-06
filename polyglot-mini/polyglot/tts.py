"""TTS codec — speech route with optional ambient layering.

Primary: macOS `say` → AIFF → `afconvert` → M4A/WAV. Zero deps.
Ambient: text prompt → audio adapter MLP → category → procedural ambient → mix.
Optional: LLM preprocesses prompt → clean speakable script + voice hint.
"""
from __future__ import annotations
import os
import shutil
import subprocess
import sys
import time
from .llm import chat


SCRIPT_SYSTEM = """You turn a user prompt into a short spoken script.
Return ONLY the script text (no preamble, no quotes, no stage directions in brackets).
Keep it under 60 seconds when read aloud. Natural spoken English or the prompt's language."""


MAC_VOICES = {
    "en": "Samantha",
    "en-uk": "Daniel",
    "zh": "Tingting",
    "ja": "Kyoko",
    "default": "Samantha",
}


def _have(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def _say_to_aiff(text: str, aiff_path: str, voice: str, rate_wpm: int = 180) -> None:
    subprocess.run(
        ["say", "-v", voice, "-r", str(rate_wpm), "-o", aiff_path, text],
        check=True, capture_output=True,
    )


def _aiff_to_mp3(aiff_path: str, out_path: str) -> str:
    """afconvert can output m4a (aac). If .mp3 requested, fall back to m4a with a warning."""
    root, ext = os.path.splitext(out_path)
    ext = ext.lower().lstrip(".")
    if ext in ("m4a", "aac", "caf"):
        fmt, codec, target = "m4af", "aac", out_path
    elif ext == "mp3":
        # afconvert has no mp3 encoder by default; emit m4a alongside.
        target = root + ".m4a"
        fmt, codec = "m4af", "aac"
    elif ext == "wav":
        fmt, codec, target = "WAVE", "LEI16", out_path
    else:
        target = root + ".m4a"
        fmt, codec = "m4af", "aac"

    subprocess.run(
        ["afconvert", "-f", fmt, "-d", codec, aiff_path, target],
        check=True, capture_output=True,
    )
    return target


def _predict_ambient(prompt: str) -> dict | None:
    """Use trained audio adapter to predict ambient category + volume for a prompt."""
    here = os.path.dirname(os.path.abspath(__file__))
    adapter = os.path.join(here, "..", "train", "audio_adapter.npz")
    if not os.path.exists(adapter):
        return None
    try:
        sys.path.insert(0, os.path.join(here, ".."))
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            from train.train_audio import predict as audio_predict
        return audio_predict(prompt, adapter_path=adapter)
    except Exception:
        return None


def generate_speech(
    prompt: str,
    out_path: str,
    *,
    voice: str | None = None,
    lang: str = "en",
    rate_wpm: int = 180,
    use_llm_script: bool = True,
    seed: int = 0,
    ambient: str | None = "auto",  # "auto"|category|"none"
    ambient_vol: float | None = None,
) -> dict:
    started = time.time()
    llm_in = llm_out = 0

    if use_llm_script:
        try:
            r = chat(prompt, system=SCRIPT_SYSTEM, temperature=0.5, max_tokens=600)
            llm_in, llm_out = r.input_tokens, r.output_tokens
            script = r.text.strip().strip('"')
        except Exception:
            script = prompt
    else:
        script = prompt

    if not _have("say"):
        raise RuntimeError(
            "macOS `say` not found; the polyglot-mini TTS path is macOS-only. "
            "See polyglot-mini/README.md and docs/implementation-status.md for the platform matrix; "
            "cross-platform speech is in the TypeScript `@wittgenstein/codec-audio` codec via the Kokoro backend (Issue #116 / PR #158)."
        )

    voice = voice or MAC_VOICES.get(lang, MAC_VOICES["default"])

    aiff = out_path + ".__tmp__.aiff"
    _say_to_aiff(script, aiff, voice=voice, rate_wpm=rate_wpm)

    # Convert to WAV for mixing (wav is lossless intermediate)
    base, ext = os.path.splitext(out_path)
    wav_speech = out_path + ".__speech__.wav"
    try:
        subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16", aiff, wav_speech],
                       check=True, capture_output=True)
    finally:
        if os.path.exists(aiff):
            os.unlink(aiff)

    # Ambient layering
    ambient_meta: dict | None = None
    if ambient != "none":
        from .audio_ambient import generate_ambient, mix_wav_files
        try:
            if ambient == "auto":
                pred = _predict_ambient(prompt)
                if pred and pred.get("category") not in ("silence", None):
                    amb_cat = pred["category"]
                    amb_vol = ambient_vol if ambient_vol is not None else pred["volume"]
                    ambient_meta = {"category": amb_cat, "volume": amb_vol, "source": pred.get("source")}
                else:
                    amb_cat = None
            else:
                amb_cat = ambient
                amb_vol = ambient_vol if ambient_vol is not None else 0.3
                if amb_cat and amb_cat != "silence":
                    ambient_meta = {"category": amb_cat, "volume": amb_vol, "source": "explicit"}

            if amb_cat and amb_cat != "silence":
                import wave as wave_mod
                with wave_mod.open(wav_speech, "r") as wf:
                    dur_samples = wf.getnframes()
                    dur_s = dur_samples / wf.getframerate()

                amb_wav = out_path + ".__ambient__.wav"
                generate_ambient(amb_cat, dur_s + 0.5, amb_wav, volume=1.0, seed=seed)

                mixed_wav = out_path + ".__mixed__.wav"
                mix_wav_files(wav_speech, amb_wav, mixed_wav, ambient_vol=amb_vol)
                os.unlink(amb_wav)
                os.unlink(wav_speech)
                wav_speech = mixed_wav
        except Exception as e:
            ambient_meta = {"error": str(e)}

    try:
        final_path = _aiff_to_mp3(wav_speech, out_path)
    finally:
        if os.path.exists(wav_speech):
            os.unlink(wav_speech)

    return {
        "ok": True,
        "codec": "audio:speech-macsay" + ("+ambient" if ambient_meta and "error" not in ambient_meta else ""),
        "artifact_path": final_path,
        "requested_path": out_path,
        "voice": voice,
        "script": script,
        "ambient": ambient_meta,
        "llm_tokens": {"input": llm_in, "output": llm_out},
        "duration_ms": int((time.time() - started) * 1000),
        "seed": seed,
    }
