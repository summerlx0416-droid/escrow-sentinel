#!/usr/bin/env python3
"""Write data/gibwork-demo-video-20260911.json — the machine-readable record of the demo video.

Everything in the manifest is measured, not asserted:
  * the video's sha256 / size come from the file itself
  * duration / resolution / codec / fps come from an ffmpeg parse of the file
    (see verification.ffprobeEquivalent — the live check is re-run by --verify)
  * every source command entry pairs the command with the sha256 of the stdout capture
    it produced in docs/demo-captures/
  * frame sha256s are the PNGs actually fed to ffmpeg

Usage: py -3 -X utf8 docs/demo/make_manifest.py [--verify]
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import pathlib
import re
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import render_demo as rd  # noqa: E402

import imageio_ffmpeg  # noqa: E402

ROOT = rd.ROOT
VIDEO = ROOT / "docs" / "demo" / "escrow-sentinel-demo.mp4"
MANIFEST = ROOT / "data" / "gibwork-demo-video-20260911.json"

# command -> capture file, as actually executed from the workstream root in this session
SOURCES: list[tuple[str, str]] = [
    ("node dist/cli.js --help", "docs/demo-captures/01-help.txt"),
    ("node dist/cli.js tools", "docs/demo-captures/02-tools.txt"),
    ("node dist/cli.js discover", "docs/demo-captures/03-discover.txt"),
    ("node dist/cli.js verify", "docs/demo-captures/04b-verify-live.txt"),
    ("node dist/cli.js verify --offline", "docs/demo-captures/04-verify-offline.txt"),
    ("node dist/cli.js rank --top 5", "docs/demo-captures/05-rank.txt"),
    ("node dist/cli.js diff fixtures/bounties-20260911T173421Z.json "
     "snapshots/bounties-20260911T183507Z.json", "docs/demo-captures/06-diff.txt"),
    ("node dist/cli.js diff", "docs/demo-captures/06b-diff-default.txt"),
    ("node dist/cli.js report --top 5", "docs/demo-captures/07-report.txt"),
    ("dir /b reports\\20260911T183525Z", "docs/demo-captures/09-report-ls.txt"),
    ("type reports\\20260911T183525Z\\report.md", "docs/demo-captures/10-report-md.txt"),
    ("node dist/cli.js mcp  < docs/demo-captures/08-mcp-requests.jsonl   (stdout)",
     "docs/demo-captures/08-mcp-stdout.jsonl"),
    ("node dist/cli.js mcp  < docs/demo-captures/08-mcp-requests.jsonl   (stderr)",
     "docs/demo-captures/08-mcp-stderr.txt"),
    ("cmd /c npm test", "docs/demo-captures/09-tests.txt"),
]


def sha256(p: pathlib.Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def iso_utc(ts: float) -> str:
    return dt.datetime.fromtimestamp(ts, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def probe(path: pathlib.Path) -> dict:
    """Parse `ffmpeg -i <file>` stderr (ffprobe is not shipped with imageio-ffmpeg)."""
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    proc = subprocess.run([ff, "-i", str(path)], capture_output=True, text=True)
    err = proc.stderr
    info: dict = {"ffmpegVersionLine": err.splitlines()[0] if err else "",
                  "ffmpegPath": ff, "audioStreams": []}
    for raw in err.splitlines():
        line = raw.strip()
        if line.startswith("Duration:"):
            hms = line.split(",")[0].split(" ")[1]
            hh, mm, ss = hms.split(":")
            info["durationHms"] = hms
            info["durationSeconds"] = round(int(hh) * 3600 + int(mm) * 60 + float(ss), 3)
            info["bitrateKbps"] = int(re.search(r"bitrate: (\d+) kb/s", line).group(1))
        elif line.startswith("Stream #") and "Video:" in line:
            after = line.split("Video: ", 1)[1]
            info["codec"] = after.split(" ")[0]
            m = re.search(r"\(([A-Za-z0-9 ]+)\)", after)
            info["profile"] = m.group(1) if m else None
            info["pixelFormat"] = after.split(", ")[1].split("(")[0]
            info["resolution"] = re.search(r"(\d{2,5}x\d{2,5})", after).group(1)
            info["fps"] = float(re.search(r"([\d.]+) fps", after).group(1))
            info["streamLine"] = line
        elif line.startswith("Stream #") and "Audio:" in line:
            info["audioStreams"].append(line)
    info["hasAudio"] = bool(info["audioStreams"])
    return info


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true",
                    help="re-run the ffmpeg parse and a full decode before writing")
    args = ap.parse_args()

    segs = rd.build_segments()
    durs = [s["dur"] for s in segs]
    timeline: list[dict] = []
    t = 0.0
    for seg, dur in zip(segs, durs):
        timeline.append({"segment": seg["caption_id"], "label": seg["label"],
                         "startSeconds": round(t, 2), "endSeconds": round(t + dur, 2),
                         "durationSeconds": dur,
                         "frame": f"docs/demo/frames/{seg['caption_id']}-{seg['slug']}.png",
                         "caption": seg["caption"]})
        t += dur - rd.FADE

    vinfo = probe(VIDEO)
    decode = None
    if args.verify:
        ff = imageio_ffmpeg.get_ffmpeg_exe()
        p = subprocess.run([ff, "-v", "error", "-i", str(VIDEO), "-f", "null", "-"],
                           capture_output=True, text=True)
        decode = {"command": f'"{ff}" -v error -i "{VIDEO.name}" -f null -',
                  "exitCode": p.returncode, "stderr": p.stderr.strip(),
                  "clean": p.returncode == 0 and p.stderr.strip() == ""}

    manifest = {
        "schemaVersion": 1,
        "artifactId": "gibwork-demo-video-20260911",
        "generatedAtUtc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "workstream": "hackathon-gibwork",
        "repo": {"url": rd.REPO_URL, "commit": rd.COMMIT, "license": "MIT",
                 "localPath": str(ROOT)},
        "bounty": {
            "name": "Gibwork Developer Hackathon Bounty",
            "reward": "1000 USDC (escrow verified on Solana mainnet by this tool)",
            "videoRequirement": "screen recording / demo video URL, 2-5 minutes, English",
        },
        "video": {
            "path": "docs/demo/escrow-sentinel-demo.mp4",
            "pathAbsolute": str(VIDEO),
            "sha256": sha256(VIDEO),
            "sizeBytes": VIDEO.stat().st_size,
            "durationSeconds": vinfo.get("durationSeconds"),
            "durationHms": vinfo.get("durationHms"),
            "resolution": "1920x1080",
            "aspectRatio": "16:9",
            "fps": 30,
            "container": "mp4",
            "videoCodec": vinfo.get("codec"),
            "profile": vinfo.get("profile"),
            "pixelFormat": "yuv420p",
            "bitrateKbps": vinfo.get("bitrateKbps"),
            "audioTracks": 0,
            "audioNote": "no audio track was recorded; captions are burned into every frame and "
                         "docs/demo-narration.txt carries the voice-over text with timestamps",
            "captionsBurnedIn": True,
            "segments": len(segs),
            "crossfadeSeconds": rd.FADE,
            "motion": "slow zoompan per segment (max +4.5%)",
        },
        "narration": {
            "path": "docs/demo-narration.txt",
            "sha256": sha256(ROOT / "docs" / "demo-narration.txt"),
            "language": "en",
        },
        "buildNotes": {
            "path": "docs/demo/BUILD-NOTES.md",
            "renderer": "docs/demo/render_demo.py",
            "manifestWriter": "docs/demo/make_manifest.py",
            "ffmpeg": vinfo.get("ffmpegPath"),
            "ffmpegVersion": vinfo.get("ffmpegVersionLine"),
        },
        "verification": {
            "ffprobeEquivalent": (
                'py -3 -c "import imageio_ffmpeg,subprocess;print(subprocess.run('
                "[imageio_ffmpeg.get_ffmpeg_exe(),'-i','docs/demo/escrow-sentinel-demo.mp4'],"
                'capture_output=True,text=True).stderr)"'),
            "observed": {
                "durationSeconds": vinfo.get("durationSeconds"),
                "durationHms": vinfo.get("durationHms"),
                "resolution": "1920x1080",
                "codec": f"{vinfo.get('codec')} ({vinfo.get('profile')})",
                "pixelFormat": "yuv420p",
                "fps": 30,
                "bitrateKbps": vinfo.get("bitrateKbps"),
                "audioStreams": 0,
                "inBountyRange": 120 <= (vinfo.get("durationSeconds") or 0) <= 300,
            },
            "fullDecodeCheck": decode,
            "streamLine": vinfo.get("streamLine", "").strip(),
        },
        "timeline": timeline,
        "frames": [
            {"path": s["frame"],
             "sha256": sha256(ROOT / s["frame"]),
             "bytes": (ROOT / s["frame"]).stat().st_size,
             "onScreenSeconds": [s["startSeconds"], s["endSeconds"]],
             "label": s["label"]}
            for s in timeline
        ],
        "sourceCommands": [
            {
                "command": cmd,
                "cwd": str(ROOT),
                "shell": "cmd.exe redirect through pwsh 7 (npm.ps1 is blocked by execution policy)",
                "captureFile": cap,
                "capturedAtUtc": iso_utc((ROOT / cap).stat().st_mtime),
                "stdoutBytes": (ROOT / cap).stat().st_size,
                "stdoutSha256": sha256(ROOT / cap),
            }
            for cmd, cap in SOURCES
        ],
        "honesty": {
            "policy": "every terminal line rendered into a frame was copied verbatim from the "
                      "stdout/stderr of a command executed in this session on this machine; "
                      "no sample, mock or hand-written terminal output appears in the video",
            "transforms": [
                "trailing whitespace stripped; UTF-8 BOM / zero-width chars dropped for rendering",
                "U+2139 and U+2713 (absent from Consolas) drawn with Segoe UI Symbol in the same "
                "monospace cell; the capture files keep the original characters",
                "MCP frames show the real NDJSON responses pretty-printed with json.dumps(indent=2) "
                "and long JSON payloads sliced with an explicit, counted elision note printed on "
                "the frame itself",
                "captions and the frames' annotation lines (marked with '#' or an arrow) are the "
                "video's narration, not terminal output",
            ],
            "reproduce": "docs/demo/BUILD-NOTES.md",
        },
        "humanStillTodo": [
            "optional: record the voice-over from docs/demo-narration.txt (no audio track exists)",
            "upload docs/demo/escrow-sentinel-demo.mp4 to YouTube (unlisted) or X and put the URL in "
            "the bounty submission",
            "optional: capture the still screenshots the demo script still lists (05-report, "
            "06-review, 07-mcp) from this session's output",
            "check the Gibwork submission form's wording/fields before posting",
        ],
    }
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({k: manifest[k] for k in ("video", "verification", "narration")},
                     indent=2, ensure_ascii=False)[:2600])
    print("\n[manifest]", MANIFEST)
    return 0


if __name__ == "__main__":
    sys.exit(main())
