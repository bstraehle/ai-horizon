"""Add Amazon Polly narration to a recorded autoplay run and encode the store video.

Usage:
  python store-video/narrate.py [--raw store-video/_raw-2048x1000.mp4] [--script store-video/narration.json]
      [--out store-video/ai-horizon-1024x500.mp4] [--size 1024x500] [--crf 14]

The raw video comes from `npm run record -- --width=1024 --height=500 --scale=2 --seed=39996 ...`
(supersampled 2x). The 16:9 build uses the same script on a 960x540 @4x recording:
`npm run record -- --width=960 --height=540 --scale=4 --seed=2024 --out=store-video/_raw-3840x2160.mp4`
then `python store-video/narrate.py --raw store-video/_raw-3840x2160.mp4 --size 3840x2160
--out store-video/ai-horizon-3840x2160.mp4` (seed 2024 completes the full 90s at that aspect; 39996
dies after 15s). Each narration cue has a target start time `at` (seconds of video) and a voice;
cues never overlap: a cue starts at max(at, previous cue end + gap). The last frame is held until
the final cue has finished plus `tail` seconds. Speech is synthesised as MP3, mixed onto a 48 kHz
track and normalised to -16 LUFS integrated (linear gain + peak limiter, so the voice/effects
balance is preserved); a matching .srt is written next to the MP4. Conventions follow the
svg-to-mp4 agent skill: female host for the intro/outro, male narrator for the gameplay.

Voices in the script's `voices` map are either a Polly voice name (the `engine`, neural by default,
at 24 kHz, cached in store-video/.polly-cache/, us-east-1 fallback when the engine is unavailable)
or an ElevenLabs voice `{"elevenlabs": "<voice id>", "model": "eleven_v4", "settings": {...}}`
(`model` and the optional `settings`, sent as `voice_settings`; 44.1 kHz, cached in
store-video/.elevenlabs-cache/). ElevenLabs reads its API key from ELEVENLABS_API_KEY or, failing
that, .secrets/api_key.txt (gitignored). Delete a cached clip to re-generate it.

Game sound (optional): record with `--sfx=store-video/_sfx-3840x2160.json`, render it with
`node --experimental-websocket scripts/render-sfx.cjs --events=store-video/_sfx-3840x2160.json`,
then pass `--sfx store-video/_sfx-3840x2160.wav`. The effects are set `--sfx-lu` (default 10) LU
below the measured loudness of the voice-over cues and ducked further by a sidechain compressor
keyed on the narration, so the voice stays clear (>= ~10 dB over the game) while the game is
audible between and under the cues.

Commander's voice (optional): render-sfx also writes `_sfx-....-comms.wav` when the recording
captured the AI debrief's spoken clip; pass it as `--comms`. It is mixed at the voice-over's
loudness, ducks the game like the narration, and any cue that would overlap it starts after it.
"""
from __future__ import annotations

import argparse
import array
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
FFMPEG_DIR = HERE.parent / ".tools" / "ffmpeg" / "ffmpeg-8.1.2-essentials_build" / "bin"
RATE = 48000
FALLBACK_REGION = "us-east-1"
ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128"
ELEVENLABS_KEY_FILE = HERE.parent / ".secrets" / "api_key.txt"
TARGET_LUFS = -16.0
PEAK_LIMIT = 0.84  # ~-1.5 dBFS
DUCK = "sidechaincompress=threshold=0.03:ratio=4:attack=15:release=350:knee=4"


def tool(name: str) -> str:
    local = FFMPEG_DIR / f"{name}.exe"
    return str(local) if local.exists() else name


def cache_path(cache: Path, key: str, text: str) -> Path:
    cache.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha1(key.encode()).hexdigest()[:12]
    return cache / (re.sub(r"[^a-z0-9]+", "-", text.lower())[:50].strip("-") + f"_{digest}.mp3")


def synthesize(text: str, voice: str | dict, engine: str) -> Path:
    if isinstance(voice, dict):
        return synthesize_elevenlabs(text, voice, HERE / ".elevenlabs-cache")
    return synthesize_polly(text, voice, engine, HERE / ".polly-cache")


def synthesize_elevenlabs(text: str, voice: dict, cache: Path) -> Path:
    body = {"text": text, "model_id": voice.get("model", "eleven_v4")}
    if "settings" in voice:
        body["voice_settings"] = voice["settings"]
    voice_id = voice["elevenlabs"]
    path = cache_path(cache, f"elevenlabs|{voice_id}|{json.dumps(body, sort_keys=True)}", text)
    if path.exists():
        return path
    key = os.environ.get("ELEVENLABS_API_KEY") or (
        ELEVENLABS_KEY_FILE.read_text(encoding="utf-8").strip() if ELEVENLABS_KEY_FILE.exists() else "")
    if not key:
        sys.exit(f"ElevenLabs voice needs ELEVENLABS_API_KEY or {ELEVENLABS_KEY_FILE}")
    req = urllib.request.Request(
        ELEVENLABS_URL.format(voice=voice_id), data=json.dumps(body).encode(), method="POST",
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            path.write_bytes(resp.read())
    except urllib.error.HTTPError as exc:
        sys.exit(f"ElevenLabs error {exc.code}: {exc.read().decode(errors='replace')}")
    return path


def synthesize_polly(text: str, voice: str, engine: str, cache: Path) -> Path:
    import boto3
    from botocore.exceptions import ClientError

    path = cache_path(cache, f"{voice}|{engine}|24k|{text}", text)
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


def loudness(audio: Path) -> float:
    """Integrated loudness (LUFS) via ffmpeg's loudnorm analysis."""
    cmd = [tool("ffmpeg"), "-hide_banner", "-nostats", "-i", str(audio),
           "-af", "loudnorm=print_format=json", "-f", "null", "-"]
    err = subprocess.run(cmd, check=True, capture_output=True, text=True).stderr
    return float(json.loads(err[err.rindex("{"):err.rindex("}") + 1])["input_i"])


def busy_span(audio: Path, threshold: float = 0.02) -> tuple[float, float] | None:
    """First and last moment (seconds) a track rises above `threshold` of full scale."""
    samples = array.array("h", decode(audio))
    limit = int(threshold * 32767)
    loud = [i for i in range(0, len(samples), 48) if abs(samples[i]) > limit]
    return (loud[0] / RATE, loud[-1] / RATE) if loud else None


def mix(narration: Path, sfx: Path | None, sfx_lu: float, out: Path, comms: Path | None = None) -> None:
    """Narration alone, or narration (plus the commander's comms track, at the same loudness)
    over the effects bed, which both duck (float WAV)."""
    if sfx is None:
        cmd = [tool("ffmpeg"), "-y", "-v", "error", "-i", str(narration),
               "-af", "aformat=channel_layouts=stereo", "-c:a", "pcm_f32le", str(out)]
    else:
        voice = loudness(narration)
        sfx_lufs = voice - sfx_lu
        gain = sfx_lufs - loudness(sfx)
        stereo = "aformat=sample_rates=48000:channel_layouts=stereo"
        if comms is None:
            voices = f"[0:a]{stereo},asplit=2[voice][key];"
        else:
            comms_gain = voice - loudness(comms)
            voices = (
                f"[0:a]{stereo}[narr];[2:a]{stereo},volume={comms_gain:.2f}dB,apad[comms];"
                "[narr][comms]amix=inputs=2:duration=first:normalize=0,asplit=2[voice][key];"
            )
            print(f"commander's voice: {comms_gain:+.1f} dB to the voice-over's {voice:.1f} LUFS",
                  file=sys.stderr)
        graph = (
            voices
            + f"[1:a]{stereo},volume={gain:.2f}dB,apad[bed];"
            + f"[bed][key]{DUCK}[ducked];"
            + "[voice][ducked]amix=inputs=2:duration=first:normalize=0[out]"
        )
        inputs = ["-i", str(narration), "-i", str(sfx)] + (["-i", str(comms)] if comms else [])
        cmd = [tool("ffmpeg"), "-y", "-v", "error", *inputs,
               "-filter_complex", graph, "-map", "[out]", "-c:a", "pcm_f32le", str(out)]
        print(f"effects bed: {gain:+.1f} dB to {sfx_lufs:.1f} LUFS ({sfx_lu:g} LU under the "
              f"{voice:.1f} LUFS voice-over), ducked while it speaks", file=sys.stderr)
    subprocess.run(cmd, check=True)


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
    ap.add_argument("--sfx", default=None, help="game sound WAV from scripts/render-sfx.cjs")
    ap.add_argument("--sfx-lu", type=float, default=10.0, help="effects bed level below the voice-over (LU)")
    ap.add_argument("--comms", default=None,
                    help="the debrief commander's voice WAV (render-sfx's -comms.wav); mixed at "
                         "voice-over level, and narration cues are moved out of its way")
    args = ap.parse_args()

    raw, out = Path(args.raw), Path(args.out)
    spec = json.loads(Path(args.script).read_text(encoding="utf-8"))
    engine, gap, tail = spec.get("engine", "neural"), spec.get("gap", 0.35), spec.get("tail", 1.0)
    voices = spec["voices"]
    comms = Path(args.comms) if args.comms else None
    busy = busy_span(comms) if comms else None
    if busy:
        print(f"commander speaks {busy[0]:.1f}s-{busy[1]:.1f}s", file=sys.stderr)

    cues, cursor = [], 0.0
    for cue in spec["cues"]:
        pcm = decode(synthesize(cue["text"], voices[cue["voice"]], engine))
        start = max(cue["at"], cursor)
        length = len(pcm) / 2 / RATE
        if busy and start < busy[1] and start + length > busy[0]:
            start = busy[1] + gap
        end = start + length
        if start > cue["at"] + 0.05:
            print(f"note: cue at {cue['at']:.1f}s pushed to {start:.1f}s by the previous cue or "
                  "the commander", file=sys.stderr)
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

    mixed = out.with_suffix(".mix.wav")
    mix(wav, Path(args.sfx) if args.sfx else None, args.sfx_lu, mixed, comms)
    gain = TARGET_LUFS - loudness(mixed)

    w, h = args.size.split("x")
    hold = max(0.0, total - raw_len)
    vf = (f"scale={w}:{h}:flags=lanczos:out_color_matrix=bt709,"
          f"tpad=stop_mode=clone:stop_duration={hold:.3f},format=yuv420p")
    subprocess.run(
        [tool("ffmpeg"), "-y", "-v", "error", "-i", str(raw), "-i", str(mixed), "-vf", vf,
         "-c:v", "libx264", "-preset", "slow", "-crf", args.crf, "-profile:v", "high", "-r", "60",
         "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
         "-af", f"volume={gain:.2f}dB,alimiter=limit={PEAK_LIMIT}:level=false",
         "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-ar", str(RATE),
         "-t", f"{total:.3f}", "-movflags", "+faststart", str(out)],
        check=True,
    )
    wav.unlink()
    mixed.unlink()
    print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB, {total:.1f}s, {len(cues)} cues)")


if __name__ == "__main__":
    main()
