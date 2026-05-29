from __future__ import annotations

import json
import os
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any


COMFY_ROOT = Path(os.environ.get("AFS_COMFY_ROOT", r"C:\0.ASKIM ALL-VIN\0.ASKIM ALL\Stable Diffusion\ComfyUI"))
DEFAULT_COMFY_URL = os.environ.get("AFS_COMFY_URL", "http://127.0.0.1:8188")
LTX_WORKFLOW = COMFY_ROOT / "custom_nodes" / "ComfyUI-LTXVideo" / "example_workflows" / "2.3" / "LTX-2.3_T2V_I2V_Single_Stage_Distilled_Full.json"


class ComfyAdapterError(RuntimeError):
    pass


def _get_json(url: str, timeout: float = 30.0) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _post_json(url: str, payload: dict[str, Any], timeout: float = 30.0) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise ComfyAdapterError(body) from exc


def comfy_available(base_url: str = DEFAULT_COMFY_URL) -> bool:
    try:
        _get_json(f"{base_url}/system_stats", timeout=5)
        return True
    except Exception:
        return False


def _workflow_to_api(workflow: dict[str, Any], object_info: dict[str, Any]) -> dict[str, Any]:
    link_map: dict[int, list[Any]] = {}
    for link in workflow.get("links", []):
        if len(link) >= 5:
            link_map[int(link[0])] = [str(link[1]), int(link[2])]

    api: dict[str, Any] = {}
    for node in workflow.get("nodes", []):
        node_id = str(node["id"])
        class_type = node.get("type")
        if class_type not in object_info:
            continue

        inputs: dict[str, Any] = {}
        connected_names: set[str] = set()
        for node_input in node.get("inputs", []) or []:
            name = node_input.get("name")
            link_id = node_input.get("link")
            if name and link_id is not None and int(link_id) in link_map:
                inputs[name] = link_map[int(link_id)]
                connected_names.add(name)

        widget_values = list(node.get("widgets_values") or [])
        widget_index = 0
        info_input = object_info[class_type].get("input", {})
        ordered_names: list[str] = []
        for section in ("required", "optional"):
            ordered_names.extend(object_info[class_type].get("input_order", {}).get(section, list(info_input.get(section, {}).keys())))
        for name in ordered_names:
            if name in connected_names or name in inputs:
                continue
            if widget_index >= len(widget_values):
                continue
            inputs[name] = widget_values[widget_index]
            widget_index += 1

        api[node_id] = {
            "class_type": class_type,
            "inputs": inputs,
            "_meta": {"title": node.get("title") or class_type},
        }
    return api


def _patch_ltx_workflow(prompt: dict[str, Any], text: str, prefix: str, seed: int, seconds: float) -> dict[str, Any]:
    # Patch installed local model filenames. The example workflow references upstream filenames.
    replacements = {
        "ltx-2.3-22b-dev.safetensors": "ltx-2.3-22b-dev-fp8.safetensors",
        "comfy_gemma_3_12B_it.safetensors": "gemma_3_12B_it_fp4_mixed.safetensors",
        "ltxv/ltx2/ltx-2.3-22b-distilled-lora-384-1.1.safetensors": "ltx-2.3-22b-distilled-lora-384.safetensors",
    }
    for node in prompt.values():
        inputs = node.get("inputs", {})
        for key, value in list(inputs.items()):
            if isinstance(value, str):
                inputs[key] = replacements.get(value, value)

        class_type = node.get("class_type")
        if class_type in {"CLIPTextEncode", "GemmaAPITextEncode"} and "text" in inputs:
            current = str(inputs.get("text", ""))
            if "ugly" not in current and "negative" not in node.get("_meta", {}).get("title", "").lower():
                inputs["text"] = text
        if class_type in {"LTXVGemmaEnhancePrompt", "TextGenerateLTX2Prompt"} and "prompt" in inputs:
            inputs["prompt"] = text
        if class_type == "RandomNoise" and "noise_seed" in inputs:
            inputs["noise_seed"] = seed
        if class_type == "KSampler" and "seed" in inputs:
            inputs["seed"] = seed
        if class_type == "EmptyLTXVLatentVideo":
            inputs["width"] = 384
            inputs["height"] = 224
            inputs["length"] = max(25, min(49, int(seconds * 16)))
            inputs["batch_size"] = 1
        if class_type == "CreateVideo":
            inputs["fps"] = 16
        if class_type == "SaveVideo":
            inputs["filename_prefix"] = prefix.replace("\\", "/")
            inputs["format"] = "mp4"
            inputs["codec"] = "h264"
        if class_type == "ResizeImageMaskNode":
            inputs["resize_type"] = "scale dimensions"
            inputs["resize_type.width"] = 384
            inputs["resize_type.height"] = 224
            inputs["resize_type.crop"] = "disabled"
            inputs["scale_method"] = "lanczos"
    sampler_select = next((node_id for node_id, node in prompt.items() if node.get("class_type") == "KSamplerSelect"), None)
    if sampler_select:
        for node in prompt.values():
            if node.get("class_type") == "SamplerCustomAdvanced":
                sampler = node.get("inputs", {}).get("sampler")
                if isinstance(sampler, list) and str(sampler[0]) not in prompt:
                    node["inputs"]["sampler"] = [sampler_select, 0]
    return prompt


def build_ltx_api_prompt(
    text: str,
    prefix: str,
    seed: int = 1234,
    seconds: float = 3.0,
    base_url: str = DEFAULT_COMFY_URL,
    preset: str = "preview",
) -> dict[str, Any]:
    profiles = {
        "turbo": {"width": 320, "height": 192, "fps": 16, "max_frames": 33},
        "fast": {"width": 352, "height": 192, "fps": 16, "max_frames": 41},
        "draft": {"width": 352, "height": 192, "fps": 16, "max_frames": 41},
        "preview": {"width": 384, "height": 216, "fps": 20, "max_frames": 61},
        "balanced": {"width": 384, "height": 216, "fps": 25, "max_frames": 73},
        "high": {"width": 384, "height": 216, "fps": 25, "max_frames": 97},
        "ultra": {"width": 384, "height": 216, "fps": 25, "max_frames": 97},
    }
    profile = profiles.get(preset.lower(), profiles["preview"])
    fps = int(profile["fps"])
    frames = max(25, min(int(profile["max_frames"]), int(seconds * fps)))
    width = int(profile["width"])
    height = int(profile["height"])
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "ltx-2.3-22b-dev-fp8.safetensors"}},
        "2": {
            "class_type": "LoraLoaderModelOnly",
            "inputs": {"model": ["1", 0], "lora_name": "ltx-2.3-22b-distilled-lora-384.safetensors", "strength_model": 1.0},
        },
        "3": {
            "class_type": "LTXAVTextEncoderLoader",
            "inputs": {
                "text_encoder": "gemma_3_12B_it_fp4_mixed.safetensors",
                "ckpt_name": "ltx-2.3-22b-dev-fp8.safetensors",
                "device": "default",
            },
        },
        "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["3", 0], "text": text}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["3", 0], "text": "test pattern, color bars, still image, static, distorted, ugly"}},
        "6": {"class_type": "LTXVConditioning", "inputs": {"positive": ["4", 0], "negative": ["5", 0], "frame_rate": float(fps)}},
        "7": {"class_type": "EmptyLTXVLatentVideo", "inputs": {"width": width, "height": height, "length": frames, "batch_size": 1}},
        "8": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "9": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "10": {
            "class_type": "LTXVScheduler",
            "inputs": {"steps": 4, "max_shift": 2.05, "base_shift": 0.95, "stretch": True, "terminal": 0.1, "latent": ["19", 0]},
        },
        "11": {
            "class_type": "GuiderParameters",
            "inputs": {
                "modality": "VIDEO",
                "cfg": 1.0,
                "stg": 1.0,
                "perturb_attn": True,
                "rescale": 0.7,
                "modality_scale": 0.0,
                "skip_step": 0,
                "cross_attn": True,
            },
        },
        "12": {
            "class_type": "MultimodalGuider",
            "inputs": {"model": ["2", 0], "positive": ["6", 0], "negative": ["6", 1], "parameters": ["11", 0], "skip_blocks": ""},
        },
        "13": {
            "class_type": "SamplerCustomAdvanced",
            "inputs": {"noise": ["8", 0], "guider": ["12", 0], "sampler": ["9", 0], "sigmas": ["10", 0], "latent_image": ["19", 0]},
        },
        "14": {
            "class_type": "LTXVTiledVAEDecode",
            "inputs": {
                "vae": ["1", 2],
                "latents": ["20", 0],
                "horizontal_tiles": 1,
                "vertical_tiles": 1,
                "overlap": 1,
                "last_frame_fix": False,
                "working_device": "auto",
                "working_dtype": "auto",
            },
        },
        "15": {"class_type": "CreateVideo", "inputs": {"images": ["14", 0], "fps": float(fps)}},
        "16": {"class_type": "SaveVideo", "inputs": {"video": ["15", 0], "filename_prefix": prefix.replace("\\", "/"), "format": "mp4", "codec": "h264"}},
        "17": {"class_type": "LTXVAudioVAELoader", "inputs": {"ckpt_name": "ltx-2.3-22b-dev-fp8.safetensors"}},
        "18": {"class_type": "LTXVEmptyLatentAudio", "inputs": {"frames_number": frames, "frame_rate": fps, "batch_size": 1, "audio_vae": ["17", 0]}},
        "19": {"class_type": "LTXVConcatAVLatent", "inputs": {"video_latent": ["7", 0], "audio_latent": ["18", 0]}},
        "20": {"class_type": "LTXVSeparateAVLatent", "inputs": {"av_latent": ["13", 0]}},
        "21": {"class_type": "LTXVAudioVAEDecode", "inputs": {"audio_vae": ["17", 0], "samples": ["20", 1]}},
    }


def _history_for_prompt(base_url: str, prompt_id: str) -> dict[str, Any] | None:
    history = _get_json(f"{base_url}/history/{prompt_id}", timeout=10)
    return history.get(prompt_id)


def _copy_comfy_output(base_url: str, history: dict[str, Any], destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    outputs = history.get("outputs", {})
    for output in outputs.values():
        for video in output.get("videos", []) or []:
            filename = video.get("filename")
            subfolder = video.get("subfolder", "")
            folder_type = video.get("type", "output")
            params = urllib.parse.urlencode({"filename": filename, "subfolder": subfolder, "type": folder_type})
            with urllib.request.urlopen(f"{base_url}/view?{params}", timeout=120) as response:
                destination.write_bytes(response.read())
            return destination
        for image in output.get("images", []) or []:
            filename = image.get("filename")
            subfolder = image.get("subfolder", "")
            folder_type = image.get("type", "output")
            src = COMFY_ROOT / folder_type / subfolder / filename
            if src.exists() and src.suffix.lower() in {".mp4", ".webm"}:
                shutil.copy2(src, destination)
                return destination
    raise ComfyAdapterError("ComfyUI completed but no video output was found")


def render_ltx_video(
    text: str,
    destination: Path,
    seconds: float = 3.0,
    seed: int | None = None,
    base_url: str = DEFAULT_COMFY_URL,
    preset: str = "preview",
) -> Path:
    if not comfy_available(base_url):
        raise ComfyAdapterError(f"ComfyUI is not available at {base_url}")
    seed = seed if seed is not None else int(time.time()) % 1_000_000_000
    prefix = f"AFS/{destination.stem}_{uuid.uuid4().hex[:8]}"
    prompt = build_ltx_api_prompt(text=text, prefix=prefix, seed=seed, seconds=seconds, base_url=base_url, preset=preset)
    result = _post_json(f"{base_url}/prompt", {"prompt": prompt, "client_id": f"afs-{uuid.uuid4().hex}"}, timeout=30)
    prompt_id = result["prompt_id"]

    deadline = time.time() + 1800
    while time.time() < deadline:
        history = _history_for_prompt(base_url, prompt_id)
        if history:
            return _copy_comfy_output(base_url, history, destination)
        time.sleep(2)
    raise ComfyAdapterError("ComfyUI render timed out")
