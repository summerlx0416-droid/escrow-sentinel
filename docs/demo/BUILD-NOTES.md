# BUILD-NOTES — Escrow Sentinel demo video

Everything below was produced on this machine (Windows, Node 24.18.0, `py -3 -X utf8`,
ffmpeg from `imageio-ffmpeg`) on **2026-09-11 UTC** by running the shipped code of
Escrow Sentinel (commit `96bf951`). No project source or README was modified — every file
listed here is new.

## 1. Deliverable

| | |
| --- | --- |
| Video | `docs/demo/escrow-sentinel-demo.mp4` |
| Size | 75,109,527 bytes (71.6 MiB) |
| sha256 | `3956871e9b842d8498ca043c63392693505dc4fd9ed2f9d01bad8a736109341a` |
| Duration | 261.00 s = **00:04:21.00** (bounty window: 2–5 min) |
| Resolution | 1920x1080 (16:9), 30 fps, `yuv420p` |
| Codec | H.264 High, 2302 kb/s, MP4 (`+faststart`) |
| Audio | **none** — narration is burned in as captions; text in `docs/demo-narration.txt` |
| Structure | 19 segments, 0.5 s crossfades, slow zoompan (+4.5 % max) per segment |

Bonus (optional, not the required deliverable): `docs/demo/escrow-sentinel-demo-narrated.mp4`
— identical video stream copied, plus an offline TTS voice-over (Windows SAPI
"Microsoft Zira Desktop", en-US). 78,412,539 bytes,
sha256 `78b3fee50c6807e8e632016b03b2275e2e7c599746ea1724bc26473abf9761ea`,
audio AAC 44.1 kHz stereo. Sources: `docs/demo/narration-tts.mp3` (3,133,170 bytes,
sha256 `ecd0ca016d741720cb81a1b8f0d91cea08ec8bfb45f6d241e691e28f6b9f1eef`) and
`docs/demo/narration-tts.wav` (11,510,144 bytes,
sha256 `36a955f497212a88b80e72f030ea4350a60d0475e10a1aa41ed9f16bff342aa8`).

## 2. Measured verification (not claims)

`ffprobe` is not shipped with `imageio-ffmpeg`, so the check is the documented equivalent:

```powershell
py -3 -c "import imageio_ffmpeg,subprocess;print(subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-i','docs/demo/escrow-sentinel-demo.mp4'],capture_output=True,text=True).stderr)"
```

Observed on the shipped file:

```
Duration: 00:04:21.00, start: 0.000000, bitrate: 2302 kb/s
Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive),
  1920x1080 [SAR 1:1 DAR 16:9], 2299 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
```

Full-decode integrity check (empty stderr = every frame decodes):

```powershell
& $ff -v error -i docs/demo/escrow-sentinel-demo.mp4 -f null -     # exit 0, no output
```

Toolchain actually used:

* ffmpeg **7.1-essentials_build-www.gyan.dev** (gyan.dev build, gcc 14.2.0 MSYS2) at
  `C:\Users\Administrator\AppData\Local\Programs\Python\Python313\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v7.1.exe`
  — `ffmpeg` is **not** on `PATH` on this machine; `imageio-ffmpeg` is the source of the binary.
* `libx264` (High profile), `libmp3lame` for the optional voice track.
* Python 3.13 + Pillow 12.3.0 for frame rendering; Consolas (`consola.ttf`) + Segoe UI Symbol
  (`seguisym.ttf`) for the two glyphs Consolas lacks.
* Node 24.18.0. `npm.ps1` is blocked by the execution policy → all npm calls go through
  `cmd /c npm …`.

## 3. The real commands that were captured

Run from the workstream root; stdout/stderr were redirected to files (never retyped):

```powershell
cmd /c "node dist/cli.js --help        > docs\demo-captures\01-help.txt 2>&1"
cmd /c "node dist/cli.js tools         > docs\demo-captures\02-tools.txt 2>&1"
cmd /c "node dist/cli.js discover      > docs\demo-captures\03-discover.txt 2>&1"
cmd /c "node dist/cli.js verify        > docs\demo-captures\04b-verify-live.txt 2>&1"
cmd /c "node dist/cli.js verify --offline > docs\demo-captures\04-verify-offline.txt 2>&1"
cmd /c "node dist/cli.js rank --top 5  > docs\demo-captures\05-rank.txt 2>&1"
cmd /c "node dist/cli.js diff fixtures/bounties-20260911T173421Z.json snapshots/bounties-20260911T183507Z.json > docs\demo-captures\06-diff.txt 2>&1"
cmd /c "node dist/cli.js diff          > docs\demo-captures\06b-diff-default.txt 2>&1"
cmd /c "node dist/cli.js report --top 5 > docs\demo-captures\07-report.txt 2>&1"
cmd /c "dir /b reports\20260911T183525Z > docs\demo-captures\09-report-ls.txt 2>&1"
cmd /c "type reports\20260911T183525Z\report.md > docs\demo-captures\10-report-md.txt 2>&1"
cmd /c "node dist/cli.js mcp < docs\demo-captures\08-mcp-requests.jsonl > docs\demo-captures\08-mcp-stdout.jsonl 2> docs\demo-captures\08-mcp-stderr.txt"
cmd /c "cmd /c npm test                > docs\demo-captures\09-tests.txt 2>&1"
```

Capture order matters and matches the video: `discover` → `verify` → `verify --offline` →
`rank` → `diff` → `report` → `mcp` → `npm test`, so `rank`/`diff` read the same snapshot
(`snapshots/bounties-20260911T183507Z.json`) that `discover`+`verify` produced in the video.

The MCP segment is a real JSON-RPC session: `docs/demo-captures/08-mcp-requests.jsonl`
(initialize, tools/list, `gib_list_bounties {only_verified:true,min_value_usd:50,top:3}`,
`gib_verify_escrow {escrow_address:…,expected_amount:1000}`) piped into `node dist/cli.js mcp`.
The server answered 4/4 and exited 0 in 15.2 s against Solana mainnet.

Result summary of the captured run: **9 verified / 0 mismatch / 0 unknown**, top score 87.9
(Gibwork Developer Hackathon Bounty, 1000 USDC verified on-chain),
`cmd /c npm test` → **46 tests, 0 fail**.

Per-command sha256 of the captured stdout lives in
`data/gibwork-demo-video-20260911.json` → `sourceCommands[]`.

## 4. How to re-render

```powershell
cd C:\Users\Administrator\Desktop\xuabsgabf\bounty-workbench\workstreams\hackathon-gibwork

# 1. frames + narration + video   (19 frames -> 261 s MP4, ~3-4 min encode)
py -3 -X utf8 docs/demo/render_demo.py

# 2. frames only (fast iteration on captions/layout)
py -3 -X utf8 docs/demo/render_demo.py --frames-only

# 3. machine-readable record (re-hashes video + frames + captures, re-parses ffmpeg)
py -3 -X utf8 docs/demo/make_manifest.py --verify

# 4. optional offline TTS voice-over + narrated cut
py -3 -X utf8 docs/demo/make_tts.py --mux
```

* `docs/demo/render_demo.py` — reads only `docs/demo-captures/*.txt` + `08-mcp-stdout.jsonl`,
  draws `docs/demo/frames/NN-slug.png` (1920x1080, caption band burned in at the bottom),
  writes `docs/demo-narration.txt`, and runs ffmpeg with one input per frame:
  `zoompan` (slow zoom) per segment then a chain of `xfade=transition=fade:duration=0.5`.
  The exact ffmpeg argv of the last build is saved in `docs/demo/ffmpeg-command.txt`.
* Segment list, durations and caption texts are the `build_segments()` table in
  `render_demo.py` — edit there and re-run to change the cut.
* Because durations overlap by the 0.5 s crossfade, the narration timestamps are
  timeline positions, not a running sum: segment *n* starts 0.5 s before segment *n−1* ends.

## 5. Honesty and rendering transforms (what is and is not verbatim)

* Every line of terminal output in a frame is copied from a capture file produced by a command
  in section 3 — nothing is retyped, mocked or invented. Numbers quoted in the narration and
  captions (87.9, 1000 USDC, 40 % coverage, 188 submissions, 46 tests, slot 446226443 …) are
  read from those captures at render time, not typed in by hand.
* Rendering-only transforms, all mechanical:
  * trailing whitespace stripped; UTF-8 BOM / zero-width characters dropped;
  * `U+2139` (ℹ) and `U+2713` (✔) are absent from Consolas, so they are drawn with Segoe UI
    Symbol inside the same monospace cell — the capture files keep the original characters;
  * over-long JSON lines are wrapped at a comma (never inside an address/id).
* MCP frames are the real NDJSON responses pretty-printed with `json.dumps(indent=2)`; where a
  payload does not fit one frame the **frame itself prints an elision note with the exact line
  range and byte count**, and the full text stays in `docs/demo-captures/08-mcp-stdout.jsonl`.
* Lines marked `#`, `-->`, `<--` and the bottom caption band are the video's narration and
  annotations — they are not terminal output. `$ …` lines are the exact commands that were run.
* No wallet, key, token or account appears on screen; the CLI never reads one.
* The close frame states the AI-assistance disclosure (README §"AI-assistance disclosure").

## 6. Files produced by this work

```
docs/demo/escrow-sentinel-demo.mp4            the deliverable (75,109,527 B)
docs/demo/escrow-sentinel-demo-narrated.mp4   optional bonus cut with TTS audio (78,412,539 B)
docs/demo/narration-tts.mp3 / .wav            optional TTS voice-over (3,133,170 / 11,510,144 B)
docs/demo/frames/01..19-*.png                 19 rendered frames (the exact ffmpeg inputs)
docs/demo/tts/seg-01..19.wav                  per-segment TTS clips (intermediate)
docs/demo/BUILD-NOTES.md                      this file
docs/demo/ffmpeg-command.txt                  exact ffmpeg argv of the last video build
docs/demo/render_demo.py                      frame + narration + video renderer
docs/demo/make_manifest.py                    manifest writer / verifier
docs/demo/make_tts.py                         optional offline voice-over
docs/demo-captures/*.txt, *.jsonl             raw captured stdout/stderr of the commands
docs/demo-narration.txt                       narration, one line per segment, with timestamps
data/gibwork-demo-video-20260911.json         machine-readable manifest (hashes, timeline, sources)
```

Side effects of running the real commands (new files only, source untouched):
`snapshots/bounties-20260911T1835*.json` and `reports/20260911T183525Z/`.

## 7. Still needs a human

1. Upload `docs/demo/escrow-sentinel-demo.mp4` (or the narrated cut) to YouTube/X and paste the
   URL into the Gibwork submission.
2. Optional: replace the robot voice with a human read of `docs/demo-narration.txt` and re-mux
   with `-c:v copy` (no re-encode needed).
3. Optional: capture the still screenshots `docs/DEMO-SCRIPT.md` still lists (`05-report.png`,
   `06-review.png`, `07-mcp.png`) — the material is in `docs/demo-captures/`.
4. The bounty also requires attending ≥ 2 hackathon Discord sessions; that is on the entrant.
