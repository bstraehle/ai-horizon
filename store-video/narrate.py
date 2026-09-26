"""Add Amazon Polly narration to a recorded autoplay run and encode the store video.

Usage:
  python store-video/narrate.py [--raw store-video/_raw-2048x1000.mp4] [--script store-video/narration.json]
      [--out store-video/ai-horizon-1024x500.mp4] [--size 1024x500] [--crf 14]

The raw video comes from `npm run record -- --width=1024 --height=500 --scale=2 --seed=39996 ...`
(supersampled 2x). Each narration cue has a target start time `at` (seconds of video) and a voice;
cues never overlap: a cue starts at max(at, previous cue end + gap). The last frame is held until
the final cue has finished plus `tail` seconds. Speech is synthesised with the Polly neural engine
as 24 kHz MP3 (cached in store-video/.polly-cache/), mixed onto a 48 kHz track and loudness
normalised to -16 LUFS; a matching .srt is written next to the MP4. Conventions follow the svg-to-mp4 agent skill: female host for the
intro/outro, male narrator for the gameplay, us-east-1 fallback when the engine is unavailable.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
FFMPEG_DIR = HERE.parent / ".tools" / "ffmpeg" / "ffmpeg-8.1.2-essentials_build" / "bin"
RATE = 48000
FALLBACK_REGION = "us-east-1"


def tool(name: str) -> str:
    local = FFMPEG_DIR / f"{name}.exe"
    return str(local) if local.exists() else name


def synthesize(text: str, voice: str, engine: str, cache: Path) -> Path:
    import boto3
    from botocore.exceptions import ClientError

    cache.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha1(f"{voice}|{engine}|24k|{text}".encode()).hexdigest()[:12]
    path = cache / (re.sub(r"[^a-z0-9]+", "-", text.lower())[:50].strip("-") + f"_{digest}.mp3")
    if path.exists():
        return path
    req = dict(Text=text, OutputFormat="mp3", SampleRate="24000", VoiceId=voice, Engine=engine)
    try:
        resp = boto3.client("polly").synthesize_speech(**req)
    except ClientError as exc:
        if "not supported in this region" not in str(exc):
            raise
        print(f"note: {engine} unavailable in default region; retrying in {FALLBACK_REGION}", file=sys.stderr)
        resp = boto3.client("polly", region_name=FALLBACK_REGION).synthesize_speech(**req)
    path.write_bytes(resp["AudioStream"].read())
    return path


def decode(mp3: Path) -> bytes:
    cmd = [tool("ffmpeg"), "-v", "error", "-i", str(mp3), "-f", "s16le", "-ac", "1", "-ar", str(RATE), "-"]
    return subprocess.run(cmd, check=True, capture_output=True).stdout


def duration(video: Path) -> float:
    cmd = [tool("ffprobe"), "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)]
    return float(subprocess.run(cmd, check=True, capture_output=True, text=True).stdout.strip())


def srt_time(s: float) -> str:
    ms = int(round(s * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--raw", default=str(HERE / "_raw-2048x1000.mp4"))
    ap.add_argument("--script", default=str(HERE / "narration.json"))
    ap.add_argument("--out", default=str(HERE / "ai-horizon-1024x500.mp4"))
    ap.add_argument("--size", default="1024x500")
    ap.add_argument("--crf", default="14")
    args = ap.parse_args()

    raw, out = Path(args.raw), Path(args.out)
    spec = json.loads(Path(args.script).read_text(encoding="utf-8"))
    engine, gap, tail = spec.get("engine", "neural"), spec.get("gap", 0.35), spec.get("tail", 1.0)
    voices = spec["voices"]

    cues, cursor = [], 0.0
    for cue in spec["cues"]:
        pcm = decode(synthesize(cue["text"], voices[cue["voice"]], engine, HERE / ".polly-cache"))
        start = max(cue["at"], cursor)
        end = start + len(pcm) / 2 / RATE
        if start > cue["at"] + 0.05:
            print(f"note: cue at {cue['at']:.1f}s pushed to {start:.1f}s by the previous cue", file=sys.stderr)
        cues.append((start, end, cue["text"], pcm))
        cursor = end + gap

    raw_len = duration(raw)
    total = max(raw_len, cues[-1][1] + tail)
    buf = bytearray(int(round(total * RATE)) * 2)
    for start, _end, _text, pcm in cues:
        off = int(round(start * RATE)) * 2
        buf[off : off + len(pcm)] = pcm[: len(buf) - off]
    wav = out.with_suffix(".narration.wav")
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(RATE)
        w.writeframes(bytes(buf))

    out.with_suffix(".srt").write_text(
        "\n".join(f"{i}\n{srt_time(s)} --> {srt_time(e)}\n{t}\n" for i, (s, e, t, _p) in enumerate(cues, 1)),
        encoding="utf-8",
    )

    w, h = args.size.split("x")
    hold = max(0.0, total - raw_len)
    vf = (f"scale={w}:{h}:flags=lanczos:out_color_matrix=bt709,"
          f"tpad=stop_mode=clone:stop_duration={hold:.3f},format=yuv420p")
    subprocess.run(
        [tool("ffmpeg"), "-y", "-v", "error", "-i", str(raw), "-i", str(wav), "-vf", vf,
         "-c:v", "libx264", "-preset", "slow", "-crf", args.crf, "-profile:v", "high", "-r", "60",
         "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
         "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", str(RATE),
         "-t", f"{total:.3f}", "-movflags", "+faststart", str(out)],
        check=True,
    )
    wav.unlink()
    print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB, {total:.1f}s, {len(cues)} cues)")


if __name__ == "__main__":
    main()
