#!/usr/bin/env python3
"""OPTIONAL bonus: offline TTS voice-over for the demo, aligned to the video timeline.

The deliverable video (docs/demo/escrow-sentinel-demo.mp4) has NO audio track: all narration is
burned in as captions and written out in docs/demo-narration.txt.  This script additionally uses
the offline Windows SAPI voice that is present on this machine ("Microsoft Zira Desktop", en-US)
to synthesise a voice-over and places every segment at its real on-screen timestamp, so a human
(or a mux step) can publish a narrated cut without recording anything.

Steps:
  1. one WAV per segment via PowerShell + System.Speech   -> docs/demo/tts/seg-NN.wav
  2. measure each clip; re-synthesise too-long clips at a faster SAPI rate
  3. concatenate, padding every clip to its exact slot  -> docs/demo/narration-tts.wav
  4. encode                                              -> docs/demo/narration-tts.mp3
  5. (optional, --mux) video + voice-over, video stream copied:
     docs/demo/escrow-sentinel-demo-narrated.mp4

Usage: py -3 -X utf8 docs/demo/make_tts.py [--mux]
"""
from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import subprocess
import sys
import wave

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import render_demo as rd  # noqa: E402

import imageio_ffmpeg  # noqa: E402

VOICE = "Microsoft Zira Desktop"
RATE_HZ = 22050
PS_TEMPLATE = r"""
Add-Type -AssemblyName System.Speech
$jobs = Get-Content -Raw -Encoding UTF8 '{jobs}'
foreach ($j in ($jobs | ConvertFrom-Json)) {{
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SelectVoice('{voice}')
  $s.Rate = [int]$j.rate
  $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo({rate}, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $s.SetOutputToWaveFile($j.wav, $fmt)
  $s.Speak($j.text)
  $s.Dispose()
}}
Write-Output 'TTS_DONE'
"""


def slots() -> list[dict]:
    """Segment text + its exact slot on the 261 s timeline (crossfade-aware)."""
    segs = rd.build_segments()
    out = []
    t = 0.0
    for i, seg in enumerate(segs):
        # segment i is visible from t for dur seconds; the next one starts FADE earlier
        start = t
        end = start + seg["dur"]
        t = end - rd.FADE
        out.append({"n": seg["caption_id"], "slug": seg["slug"], "text": seg["caption"],
                    "start": start, "slot": seg["dur"] - (0 if i == len(segs) - 1 else rd.FADE)})
    return out


def ps_exe() -> str:
    """The shell actually available here is Windows PowerShell 5.1 (pwsh is not on PATH)."""
    for exe in ("pwsh", "powershell"):
        p = shutil.which(exe)
        if p:
            return p
    raise SystemExit("no PowerShell executable found for SAPI synthesis")


def synth(items: list[dict]) -> None:
    jobs = [{"wav": str(it["wav"]), "text": it["text"], "rate": it["rate"]} for it in items]
    jf = rd.OUT / "tts" / "jobs.json"
    jf.write_text(json.dumps(jobs, ensure_ascii=False), encoding="utf-8")
    script = PS_TEMPLATE.format(jobs=jf, voice=VOICE, rate=RATE_HZ)
    sf = rd.OUT / "tts" / "synth.ps1"
    sf.write_text(script, encoding="utf-8-sig")
    p = subprocess.run([ps_exe(), "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(sf)],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if "TTS_DONE" not in (p.stdout or ""):
        raise SystemExit("SAPI synthesis failed:\n" + (p.stdout or "") + (p.stderr or ""))


def wav_seconds(path: pathlib.Path) -> float:
    with wave.open(str(path), "rb") as w:
        return w.getnframes() / w.getframerate()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mux", action="store_true")
    args = ap.parse_args()

    (rd.OUT / "tts").mkdir(parents=True, exist_ok=True)
    items = slots()
    for it in items:
        it["rate"] = 0
        it["wav"] = rd.OUT / "tts" / f"seg-{it['n']}.wav"

    print("[tts] round 1 (rate 0)")
    synth(items)
    for rnd in range(2, 5):
        need = []
        for it in items:
            secs = wav_seconds(it["wav"])
            it["seconds"] = round(secs, 2)
            if secs > it["slot"] - 0.25 and it["rate"] < 8:
                import math
                factor = secs / max(0.5, it["slot"] - 0.3)
                it["rate"] = min(8, it["rate"] + max(1, math.ceil(math.log(factor, 1.16))))
                need.append(it)
        if not need:
            break
        print(f"[tts] round {rnd}: re-synthesising {len(need)} over-long clip(s) "
              f"at rate {[i['rate'] for i in need]}")
        synth(need)

    overflow = [(i["n"], i["seconds"], round(i["slot"], 2)) for i in items
                if i["seconds"] > i["slot"] - 0.1]
    total = items[-1]["start"] + items[-1]["slot"]
    print(f"[tts] clips: {len(items)}  timeline: {total:.1f}s  voice: {VOICE}")
    print(f"[tts] lengths: {[(i['n'], i['seconds'], i['rate']) for i in items]}")
    if overflow:
        print(f"[warn] clips longer than their slot (they will run into the next segment): {overflow}")

    # concatenate with exact silence padding
    out_wav = rd.OUT / "narration-tts.wav"
    with wave.open(str(out_wav), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE_HZ)
        cursor = 0.0
        for i, it in enumerate(items):
            target = it["start"]
            pad = int(round((target - cursor) * RATE_HZ))
            if pad > 0:
                out.writeframes(b"\x00\x00" * pad)
                cursor += pad / RATE_HZ
            with wave.open(str(it["wav"]), "rb") as w:
                assert w.getframerate() == RATE_HZ and w.getnchannels() == 1, it["wav"]
                frames = w.readframes(w.getnframes())
            out.writeframes(frames)
            cursor += len(frames) / 2 / RATE_HZ
        tail = int(round((total - cursor) * RATE_HZ))
        if tail > 0:
            out.writeframes(b"\x00\x00" * tail)
    print(f"[tts] wrote {out_wav} ({wav_seconds(out_wav):.1f}s)")

    ff = imageio_ffmpeg.get_ffmpeg_exe()
    mp3 = rd.OUT / "narration-tts.mp3"
    subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error", "-i", str(out_wav),
                    "-codec:a", "libmp3lame", "-b:a", "96k", str(mp3)], check=True)
    print(f"[tts] wrote {mp3} ({mp3.stat().st_size} bytes)")

    if args.mux:
        dest = rd.OUT / "escrow-sentinel-demo-narrated.mp4"
        subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error",
                        "-i", str(rd.OUT / "escrow-sentinel-demo.mp4"), "-i", str(mp3),
                        "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
                        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", "-shortest",
                        "-movflags", "+faststart", str(dest)], check=True)
        print(f"[tts] wrote {dest} ({dest.stat().st_size} bytes) — captions still burned in")
    return 0


if __name__ == "__main__":
    sys.exit(main())
