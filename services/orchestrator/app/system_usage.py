from __future__ import annotations

import shutil
import subprocess
from datetime import datetime, timezone

import psutil


def _gpu_usage() -> dict:
    if not shutil.which("nvidia-smi"):
        return {"available": False, "reason": "nvidia-smi not found"}

    command = [
        "nvidia-smi",
        "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
        "--format=csv,noheader,nounits",
    ]
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=3)
    except (subprocess.SubprocessError, OSError) as exc:
        return {"available": False, "reason": str(exc)}

    gpus = []
    for index, line in enumerate(result.stdout.strip().splitlines()):
        parts = [part.strip() for part in line.split(",")]
        if len(parts) != 5:
            continue
        name, utilization, memory_used, memory_total, temperature = parts
        gpus.append(
            {
                "index": index,
                "name": name,
                "utilization_percent": float(utilization),
                "memory_used_mb": float(memory_used),
                "memory_total_mb": float(memory_total),
                "temperature_c": float(temperature),
            }
        )
    return {"available": bool(gpus), "gpus": gpus}


def system_usage() -> dict:
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage(".")
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "cpu": {
            "usage_percent": psutil.cpu_percent(interval=0.1),
            "core_count": psutil.cpu_count(logical=True),
        },
        "memory": {
            "used_mb": round(memory.used / 1024 / 1024, 1),
            "total_mb": round(memory.total / 1024 / 1024, 1),
            "usage_percent": memory.percent,
        },
        "disk": {
            "used_gb": round(disk.used / 1024 / 1024 / 1024, 2),
            "total_gb": round(disk.total / 1024 / 1024 / 1024, 2),
            "usage_percent": disk.percent,
        },
        "gpu": _gpu_usage(),
    }
