#!/usr/bin/env python3
"""Render the Escrow Sentinel demo video (1080p H.264) from REAL captured command output.

Pipeline:
  1. read the raw stdout captures in docs/demo-captures/*.txt (produced by actually running
     the CLI commands on this machine -- see BUILD-NOTES.md for the exact invocations)
  2. render one 1920x1080 terminal-style PNG per narration segment into docs/demo/frames/
     with the narration caption burned into the bottom band
  3. build the MP4 with ffmpeg (imageio-ffmpeg): slow zoom (zoompan) per segment +
     0.5 s crossfades (xfade) between segments, H.264 / yuv420p / 30 fps
  4. write docs/demo-narration.txt (one line per segment, with timestamps)

No line of terminal output in any frame is invented: every captured line is copied
verbatim (only trailing whitespace is stripped, a UTF-8 BOM is dropped for rendering,
and over-long MCP JSON lines are wrapped / elided with an explicit byte-count note).

Usage:  py -3 -X utf8 docs/demo/render_demo.py [--frames-only]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import subprocess
import sys
import textwrap

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
CAP = ROOT / "docs" / "demo-captures"
OUT = ROOT / "docs" / "demo"
FRAMES = OUT / "frames"
REPO_URL = "https://github.com/summerlx0416-droid/escrow-sentinel"
COMMIT = "96bf951"

W, H = 1920, 1080
TITLEBAR_H = 64
CONTENT_X = 56
CONTENT_Y = 100
CAPTION_TOP = 872
CAPTION_X = 56
CAPTION_W = W - 2 * CAPTION_X
FADE = 0.5  # crossfade seconds
FPS = 30

FONT_REG = "C:/Windows/Fonts/consola.ttf"
FONT_BOLD = "C:/Windows/Fonts/consolab.ttf"

BG = (12, 16, 23)
TITLEBAR = (22, 27, 34)
DOTS = [(255, 95, 86), (255, 189, 46), (39, 201, 63)]
LINEC = (48, 54, 61)
PROMPT = (88, 166, 255)
OUT_TXT = (201, 209, 217)
DIM = (139, 148, 158)
REQ = (121, 192, 255)
RES = (126, 231, 135)
ACCENT = (210, 153, 34)
COPPER = (198, 120, 90)
CAP_BG = (17, 22, 29)
CAP_TXT = (240, 246, 252)
CAP_LABEL = (198, 120, 90)
GREEN = (126, 231, 135)

STYLE_COLORS = {
    "prompt": PROMPT,
    "out": OUT_TXT,
    "dim": DIM,
    "req": REQ,
    "res": RES,
    "accent": ACCENT,
    "copper": COPPER,
    "green": GREEN,
    "bold": (255, 255, 255),
}


def load(name: str) -> list[str]:
    """Read a real capture; strip CR / trailing blanks / BOM."""
    text = (CAP / name).read_text(encoding="utf-8", errors="replace")
    text = text.replace("\ufeff", "").replace("\u200b", "")
    return [ln.rstrip() for ln in text.splitlines()]


def load_mcp_requests() -> list[str]:
    return load("08-mcp-requests.jsonl")


def mcp_responses() -> list[dict]:
    return [json.loads(ln) for ln in load("08-mcp-stdout.jsonl")]


def tool_text(resp: dict) -> str:
    return resp["result"]["content"][0]["text"]


def pretty(raw: str, indent: int = 2) -> list[str]:
    try:
        return json.dumps(json.loads(raw), indent=indent, ensure_ascii=False).splitlines()
    except Exception:
        return raw.splitlines()


# --------------------------------------------------------------------------- #
# frame definitions -- every "lines" entry is (text, style)
# --------------------------------------------------------------------------- #

def seg_title() -> list[tuple[str, str]]:
    return [
        ("   ESCROW  SENTINEL", "bold"),
        ("   A read-only Gibwork bounty radar for developers and AI agents.", "out"),
        ("", "out"),
        ("   repo     " + REPO_URL, "accent"),
        ("   bounty   Gibwork Developer Hackathon Bounty — 1000 USDC escrow", "accent"),
        ("   toolset  MCP server + CLI (TypeScript, Node >= 22, zero runtime deps, MIT)", "out"),
        ("   commit   " + COMMIT + "  (HEAD when this demo was recorded)", "dim"),
        ("", "out"),
        ("   Everything shown in this video was produced by running the shipped code.", "out"),
        ("   Command output is quoted verbatim from docs/demo-captures/*.txt.", "out"),
        ("", "out"),
        ("   Demo run: 2026-09-11, UTC — no wallet, no API key, no account.", "dim"),
    ]


def seg_problem() -> list[tuple[str, str]]:
    disc = load("03-discover.txt")
    ver = load("04b-verify-live.txt")
    row = [l for l in disc if l.startswith("cc14599e")][0]
    vrow = [l for l in ver if "Refer. Share. Win" in l][0]
    return [
        ("$ node dist/cli.js discover", "prompt"),
        ("(" + row + ")", "out"),
        ("", "out"),
        ("$ node dist/cli.js verify", "prompt"),
        ("(" + vrow + ")", "out"),
        ("", "out"),
        ("# the two rows above are quoted verbatim from docs/demo-captures/03-discover.txt", "dim"),
        ("# and docs/demo-captures/04b-verify-live.txt", "dim"),
        ("", "out"),
        ("→ the title promises $300 USDC", "copper"),
        ("→ the listing asset is CREDITS, not USDC", "copper"),
        ("→ the escrow token account holds 120 — 40% of the advertised pool", "copper"),
        ("→ verified: the 120 is really on Solana mainnet right now", "green"),
    ]


def seg_cmd(name: str, cmd: str, page: tuple[int, int] | None = None,
            note: str | None = None) -> list[tuple[str, str]]:
    lines = load(name)
    total = len(lines)
    label = None
    if page:
        a, b = page
        lines = lines[a - 1:b]
        label = f"# lines {a}–{b} of {total}"
    out: list[tuple[str, str]] = [("$ " + cmd, "prompt")]
    out += [(ln, "out") for ln in lines]
    if note:
        out.append(("", "out"))
        out.append(("# " + note, "dim"))
    if label:
        out.append((label, "dim"))
    return out


def seg_mcp_handshake() -> list[tuple[str, str]]:
    reqs = load_mcp_requests()
    resps = mcp_responses()
    stderr = load("08-mcp-stderr.txt")[0]
    r1 = json.dumps(resps[0], ensure_ascii=False)
    r2 = json.dumps(resps[1], ensure_ascii=False)
    keep = r2[:132]
    elided = len(r2) - len(keep)
    names = ", ".join(t["name"] for t in resps[1]["result"]["tools"])
    out: list[tuple[str, str]] = [
        ("$ node dist/cli.js mcp   (stdin: docs/demo-captures/08-mcp-requests.jsonl)", "prompt"),
        ("[stderr] " + stderr, "dim"),
        ("", "out"),
    ]
    out += req_lines(json.loads(reqs[0]))
    out.append(("<-- " + r1, "res"))
    out.append(("", "out"))
    out += req_lines(json.loads(reqs[1]))
    out.append(("<-- " + keep + " …", "res"))
    out.append((f"    # elided here: {elided} more bytes of the real response (the four inputSchema "
                f"blocks)", "dim"))
    out.append(("    # full line: docs/demo-captures/08-mcp-stdout.jsonl", "dim"))
    out.append(("", "out"))
    out.append(("    tools advertised by that response: " + names, "green"))
    return out


def wrap_json(raw: str, width: int, indent: str = "    ") -> list[str]:
    """Break a compact JSON line at commas so no token (address, id) is split."""
    out: list[str] = []
    cur = raw
    first = True
    while len(cur) > width:
        cut = cur.rfind(",", 0, width)
        if cut == -1:
            cut = width
        else:
            cut += 1  # keep the comma on the first line
        out.append(cur[:cut] if first else indent + cur[:cut])
        cur = cur[cut:]
        first = False
    out.append(cur if first else indent + cur)
    return out


def req_lines(req: dict, raw: str | None = None) -> list[tuple[str, str]]:
    raw = raw if raw is not None else json.dumps(req, separators=(",", ":"), ensure_ascii=False)
    return [("--> " + ln, "req") for ln in wrap_json(raw, 112)]


def json_slice(body: list[str], a: int, b: int) -> list[str]:
    return body[a - 1:b]


def seg_mcp_list(part: int) -> list[tuple[str, str]]:
    reqs = load_mcp_requests()
    resp = mcp_responses()[2]
    body = pretty(tool_text(resp))
    n = len(body)
    if part == 1:
        keep = json_slice(body, 21, 37)
        note = (f"    # elided for the frame: lines 1-20 and 38-{n} of the same real response"
                f" (continued in the next frame); full text in docs/demo-captures/08-mcp-stdout.jsonl")
        head = [("# the agent's question, as a tool call", "dim")]
        head += req_lines(json.loads(reqs[2]))
        head += [("", "out"),
                 (f"<-- result.content[0].text  —  real JSON, lines 21-37 of {n} (pretty-printed)",
                  "res")]
        return head + [("    " + ln, "res") for ln in keep] + [(note, "dim")]
    keep = json_slice(body, 38, 53)
    out: list[tuple[str, str]] = [
        (f"<-- gib_list_bounties — same response, lines 38-53 of {n}", "res"),
    ]
    out += [("    " + ln, "res") for ln in keep]
    out.append(("    …", "dim"))
    out.append((f"    # elided for the frame: lines 1-37 and 54-{n} (ranks 2 and 3, identical "
                f"shape); full text in docs/demo-captures/08-mcp-stdout.jsonl", "dim"))
    return out


def seg_mcp_verify() -> list[tuple[str, str]]:
    reqs = load_mcp_requests()
    resp = mcp_responses()[3]
    body = pretty(tool_text(resp))
    out: list[tuple[str, str]] = [("# the same server, called with a raw Solana token account", "dim")]
    out += req_lines(json.loads(reqs[3]))
    out.append(("", "out"))
    out.append(("<-- result.content[0].text  (JSON, pretty-printed, complete)", "res"))
    out += [("    " + ln, "res") for ln in body]
    return out


def seg_close() -> list[tuple[str, str]]:
    tests = load("09-tests.txt")
    passes = [l for l in tests if l.startswith("ℹ pass")][0]
    fails = [l for l in tests if l.startswith("ℹ fail")][0]
    return [
        ("   ESCROW  SENTINEL", "bold"),
        ("   read-only Gibwork bounty radar  ·  CLI + MCP server", "out"),
        ("", "out"),
        ("   repo      " + REPO_URL, "accent"),
        ("   license   MIT   ·   " + passes.strip() + "   ·   " + fails.strip(), "out"),
        ("   commit    " + COMMIT, "dim"),
        ("", "out"),
        ("   Read-only by construction: no wallet, no key, no signature, no transaction.", "out"),
        ("   Money is either proven on-chain or reported as unknown — never a guess.", "out"),
        ("   Every verification carries its evidence label and timestamp.", "out"),
        ("", "out"),
        ("   AI-assistance disclosure: built with AI coding assistants as a pair-programming", "dim"),
        ("   tool, reviewed and revised; every command and number shown here was produced by", "dim"),
        ("   executing the shipped code. No AI system created an account or signed anything.", "dim"),
    ]


# --------------------------------------------------------------------------- #
# drawing
# --------------------------------------------------------------------------- #

def pick_font(lines: list[str], max_w: int, max_h: int) -> tuple[ImageFont.FreeTypeFont, int, int]:
    """Largest monospace size where every line fits in max_w and the block fits in max_h."""
    for size in range(30, 15, -1):
        font = ImageFont.truetype(FONT_REG, size)
        lh = int(round(size * 1.34))
        if len(lines) * lh > max_h:
            continue
        widest = max((font.getlength(t) for t in lines), default=0)
        if widest > max_w:
            continue
        return font, lh, size
    font = ImageFont.truetype(FONT_REG, 14)
    return font, int(14 * 1.3), 14


SYMFONT = "C:/Windows/Fonts/seguisym.ttf"
_notdef_cache: dict[int, bytes] = {}
_missing_cache: dict[tuple[str, int], bool] = {}


def _notdef_bytes(path: str, size: int) -> bytes:
    key = size
    if key not in _notdef_cache:
        f = ImageFont.truetype(path, size)
        _notdef_cache[key] = bytes(f.getmask("\u0378"))  # unassigned code point -> .notdef
    return _notdef_cache[key]


def glyph_missing(ch: str, path: str, size: int) -> bool:
    """True when the font has no glyph for ch (PIL falls back to .notdef)."""
    k = (ch, size)
    if k not in _missing_cache:
        f = ImageFont.truetype(path, size)
        _missing_cache[k] = bytes(f.getmask(ch)) == _notdef_bytes(path, size)
    return _missing_cache[k]


def symbol_font(ch: str, size: int) -> ImageFont.FreeTypeFont:
    """Fallback font for glyphs Consolas lacks (e.g. U+2139 INFO SOURCE in node --test output)."""
    for s in range(int(size * 1.0), 8, -1):
        f = ImageFont.truetype(SYMFONT, s)
        if f.getlength(ch) <= size * 0.86:
            return f
    return ImageFont.truetype(SYMFONT, 12)


def draw_line(d: ImageDraw.ImageDraw, x: int, y: int, text: str,
              font: ImageFont.FreeTypeFont, size: int, fill: tuple[int, int, int]) -> None:
    """Draw one monospace line; substitute glyphs Consolas lacks, centred in the same cell."""
    cell = font.getlength("M")
    if not any(glyph_missing(c, FONT_REG, size) for c in set(text)):
        d.text((x, y), text, font=font, fill=fill)
        return
    run = ""
    cx = x
    for ch in text:
        if glyph_missing(ch, FONT_REG, size):
            if run:
                d.text((cx, y), run, font=font, fill=fill)
                cx += cell * len(run)
                run = ""
            f = symbol_font(ch, size)
            d.text((cx + (cell - f.getlength(ch)) / 2, y), ch, font=f, fill=fill)
            cx += cell
        else:
            run += ch
    if run:
        d.text((cx, y), run, font=font, fill=fill)


def wrap_long(text: str, font: ImageFont.FreeTypeFont, max_w: int, indent: str = "    ") -> list[str]:
    """Hard-wrap a line that is wider than the content box (rendering only)."""
    if font.getlength(text) <= max_w:
        return [text]
    chunks: list[str] = []
    cur = ""
    for word in text.split(" "):
        trial = word if not cur else cur + " " + word
        if font.getlength(trial) <= max_w or not cur:
            cur = trial
        else:
            chunks.append(cur)
            cur = indent + word
    if cur:
        chunks.append(cur)
    return chunks


def render(spec: dict) -> pathlib.Path:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # title bar
    d.rectangle([0, 0, W, TITLEBAR_H], fill=TITLEBAR)
    for i, c in enumerate(DOTS):
        cx = 40 + i * 26
        d.ellipse([cx - 8, TITLEBAR_H // 2 - 8, cx + 8, TITLEBAR_H // 2 + 8], fill=c)
    tfont = ImageFont.truetype(FONT_REG, 22)
    title = f"escrow-sentinel — {spec['label']}"
    d.text((W // 2 - tfont.getlength(title) / 2, 20), title, font=tfont, fill=DIM)
    d.line([0, TITLEBAR_H, W, TITLEBAR_H], fill=LINEC)

    raw_lines = spec["lines"]
    body_h = CAPTION_TOP - CONTENT_Y - 24
    font, lh, size = pick_font([t for t, _ in raw_lines], W - 2 * CONTENT_X, body_h)

    y = CONTENT_Y
    for text, style in raw_lines:
        color = STYLE_COLORS.get(style, OUT_TXT)
        f = font
        if style == "bold":
            f = ImageFont.truetype(FONT_BOLD, size)
        for chunk in wrap_long(text, font, W - 2 * CONTENT_X):
            if y + lh > CAPTION_TOP - 8:
                break
            draw_line(d, CONTENT_X, y, chunk, f, size, color)
            y += lh

    # caption band (burned-in subtitles)
    d.rectangle([0, CAPTION_TOP, W, H], fill=CAP_BG)
    d.line([0, CAPTION_TOP, W, CAPTION_TOP], fill=COPPER)
    d.rectangle([0, CAPTION_TOP, 6, H], fill=COPPER)
    cap_font = ImageFont.truetype(FONT_REG, 31)
    cap_label = ImageFont.truetype(FONT_BOLD, 31)
    label = spec["caption_id"] + "  "
    cap_lines = textwrap.wrap(spec["caption"], width=104)
    cy = CAPTION_TOP + 26
    d.text((CAPTION_X, cy), label, font=cap_label, fill=CAP_LABEL)
    dx = CAPTION_X + cap_label.getlength(label)
    for i, cl in enumerate(cap_lines):
        d.text((CAPTION_X if i else dx, cy), cl, font=cap_font, fill=CAP_TXT)
        cy += 42
    path = FRAMES / f"{spec['caption_id']}-{spec['slug']}.png"
    img.save(path)
    return path


# --------------------------------------------------------------------------- #
# segments
# --------------------------------------------------------------------------- #

def build_segments() -> list[dict]:
    disc_cmd = "node dist/cli.js discover"
    verify_cmd = "node dist/cli.js verify"
    snap = "snapshots/bounties-20260911T183507Z.json"
    rdir = "reports/20260911T183525Z"
    ls_lines = load("09-report-ls.txt")
    ob = json.loads(tool_text(mcp_responses()[2]))
    r1 = ob["ranking"][0]
    slot = r1["escrow"]["slot"]
    segs = [
        dict(slug="title", label="demo — title", dur=14.0,
             caption="Escrow Sentinel: a read-only Gibwork bounty radar. A CLI plus an MCP server, "
                     "TypeScript, MIT, no wallet and no API key. Entered in the Gibwork Developer "
                     "Hackathon Bounty — 1000 USDC escrow.",
             lines=seg_title()),
        dict(slug="problem", label="the gap in the listing", dur=16.0,
             caption="A bounty listing shows the headline, not the money. This row advertises $300 "
                     "USDC, but the listing asset is CREDITS and the on-chain escrow holds 120 — "
                     "40% of the advertised pool.",
             lines=seg_problem()),
        dict(slug="help", label="setup + command surface", dur=14.0,
             caption="Start from the command surface: discover, verify, rank, diff, report, mcp, "
                     "tools. No wallet, key or account is needed or read — the tool is read-only by "
                     "construction.",
             lines=seg_cmd("01-help.txt", "node dist/cli.js --help")),
        dict(slug="tools", label="MCP server card", dur=12.0,
             caption="tools prints the server card: four read-only tools over stdio, plus the "
                     "effective config — the RPC endpoint appears as scheme://host only, never with "
                     "a path or key.",
             lines=seg_cmd("02-tools.txt", "node dist/cli.js tools")),
        dict(slug="discover", label="discover — public listing", dur=16.0,
             caption="discover reads the same public listing endpoint the Gibwork site calls, "
                     "enriches each bounty from its detail page, and writes a UTC-stamped snapshot.",
             lines=seg_cmd("03-discover.txt", disc_cmd)),
        dict(slug="verify", label="verify — Solana mainnet", dur=18.0,
             caption="verify asks the platform for each escrow token account and reads it directly "
                     "from Solana: 9 verified, 0 mismatch, 0 unknown. The CREDITS row is flagged "
                     "instead of being rounded up.",
             lines=seg_cmd("04b-verify-live.txt", verify_cmd)),
        dict(slug="verify-offline", label="verify --offline", dur=14.0,
             caption="verify --offline opens no socket at all: rpc disabled, every row replayed "
                     "from the verification stored in the snapshot, keeping its original evidence "
                     "label and timestamp.",
             lines=seg_cmd("04-verify-offline.txt", "node dist/cli.js verify --offline")),
        dict(slug="rank", label="rank — value / competition / deadline", dur=16.0,
             caption="rank scores chain-first value, competition, deadline urgency, escrow trust "
                     "and coverage — the formula is printed on screen. The hackathon bounty scores "
                     "87.9: 1000 USDC verified, zero submissions, 48.4 days left.",
             lines=seg_cmd("05-rank.txt", "node dist/cli.js rank --top 5")),
        dict(slug="diff", label="diff — baseline vs today", dur=16.0,
             caption="diff compares the committed baseline with today's capture: one bounty closed "
                     "and dropped off the board, five submission counts moved — the CREDITS row went "
                     "from unknown to 188 entries.",
             lines=seg_cmd("06-diff.txt",
                           f"node dist/cli.js diff fixtures/bounties-20260911T173421Z.json {snap}")),
        dict(slug="report", label="report — full pipeline", dur=16.0,
             caption="report runs the whole pipeline once: 9 verified, 0 mismatch, 0 unknown, and "
                     "the top five ranked rows in one pass.",
             lines=seg_cmd("07-report.txt", "node dist/cli.js report --top 5")),
        dict(slug="report-files", label="exported artifacts", dur=10.0,
             caption="Each report run writes five artifacts: report.md for humans, report.csv for "
                     "spreadsheets, report.json for other tools, the full snapshot.json, and diff.md.",
             lines=[("$ dir /b " + rdir.replace("/", "\\"), "prompt")]
                   + [(ln, "out") for ln in ls_lines]
                   + [("", "out"),
                      ("# the same run printed these five paths:", "dim"),
                      ("# report.md  report.csv  report.json  snapshot.json  diff.md", "dim"),
                      ("# from docs/demo-captures/07-report.txt", "dim")]),
        dict(slug="report-md", label="report.md", dur=14.0,
             caption="The Markdown report keeps the provenance: every escrow row shows the token "
                     "account, the platform ledger, the on-chain amount, the status and the evidence "
                     "timestamp.",
             lines=seg_cmd("10-report-md.txt", f"type {rdir}\\report.md".replace("/", "\\"),
                           page=(1, 20))),
        dict(slug="mcp-handshake", label="MCP over stdio", dur=14.0,
             caption="The same engine is an MCP server on stdio. A client sends initialize and "
                     "tools/list; the server answers with four read-only tools — no write path "
                     "anywhere in the protocol.",
             lines=seg_mcp_handshake()),
        dict(slug="mcp-list-bounties-a", label="gib_list_bounties (1/2)", dur=14.0,
             caption="An agent asks the real question — verified escrow only, value at least 50 "
                     "USD, top 3 — and gets chain-verified rows back, starting with the hackathon "
                     "bounty: 1000 USDC and valueBasis \"onchain\".",
             lines=seg_mcp_list(1)),
        dict(slug="mcp-list-bounties-b", label="gib_list_bounties (2/2)", dur=12.0,
             caption="Same response, continued: the escrow token account, the platform ledger, the "
                     f"on-chain amount at Solana slot {slot}, coverage 1, and the flags that "
                     "explain the row.",
             lines=seg_mcp_list(2)),
        dict(slug="mcp-verify-escrow", label="gib_verify_escrow", dur=14.0,
             caption="gib_verify_escrow also takes a raw Solana token account, which makes it a "
                     "general \"is this escrow funded?\" tool inside an agent session. The response "
                     "is the complete real payload.",
             lines=seg_mcp_verify()),
        dict(slug="tests-a", label="npm test (1/2)", dur=12.0,
             caption="Nothing in this video is hand-written sample output. cmd /c npm test rebuilds "
                     "the TypeScript and runs the whole suite — no network required.",
             lines=seg_cmd("09-tests.txt", "cmd /c npm test", page=(1, 22))),
        dict(slug="tests-b", label="npm test (2/2)", dur=12.0,
             caption="46 tests, 0 failures — including the cases that prove a failed RPC, a missing "
                     "token account or a rate-limited endpoint degrade to unknown instead of "
                     "inventing a balance.",
             lines=seg_cmd("09-tests.txt", "cmd /c npm test", page=(41, 62))),
        dict(slug="close", label="close", dur=16.0,
             caption="Read-only by construction: no wallet, no key, no signature. Money is either "
                     "proven on-chain or reported as unknown — never a guess. Repo and license on "
                     "screen; built with AI coding assistants as a pair-programming tool.",
             lines=seg_close()),
    ]
    for i, s in enumerate(segs, start=1):
        s["caption_id"] = f"{i:02d}"
    return segs


# --------------------------------------------------------------------------- #
# ffmpeg
# --------------------------------------------------------------------------- #

def ffmpeg_exe() -> str:
    return imageio_ffmpeg.get_ffmpeg_exe()


def build_video(frames: list[tuple[pathlib.Path, float]], dest: pathlib.Path) -> str:
    ff = ffmpeg_exe()
    n = len(frames)
    args = [ff, "-y", "-hide_banner", "-loglevel", "error"]
    for p, _ in frames:
        args += ["-i", str(p)]
    parts = []
    for i, (_, dur) in enumerate(frames):
        f = max(2, int(round(dur * FPS)))
        parts.append(
            f"[{i}:v]zoompan=z='1+0.045*on/{f}':d={f}"
            f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={W}x{H}:fps={FPS},"
            f"setsar=1,format=yuv420p[v{i}]"
        )
    cur = "v0"
    offset = frames[0][1]
    for i in range(1, n):
        off = offset - FADE
        out = f"x{i}" if i < n - 1 else "vout"
        parts.append(f"[{cur}][v{i}]xfade=transition=fade:duration={FADE}:offset={off:.3f}[{out}]")
        cur = out
        offset = off + frames[i][1]
    filter_complex = ";".join(parts)
    args += ["-filter_complex", filter_complex, "-map", "[vout]"]
    args += ["-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p",
             "-r", str(FPS), "-movflags", "+faststart", str(dest)]
    print("[ffmpeg]", " ".join(args[:8]), "... (filter graph with %d segments)" % n)
    proc = subprocess.run(args, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit("ffmpeg failed:\n" + (proc.stderr or "")[-4000:])
    return " ".join(args)


def write_narration(segs: list[dict], durs: list[float], total: float) -> pathlib.Path:
    lines = [
        "# Escrow Sentinel — demo narration",
        "# Language: English.  Video: docs/demo/escrow-sentinel-demo.mp4 (1080p, H.264, burned-in captions)",
        f"# Total runtime: {total:.1f} s ({int(total // 60)}m{total % 60:04.1f}s). One line per segment.",
        "# No audio track was recorded: the caption text below is burned into every frame and can be",
        "# used, verbatim, as the voice-over. Timestamps are the [start-end] of each segment in the file.",
        "",
    ]
    t = 0.0
    for seg, dur in zip(segs, durs):
        start = t
        end = t + dur
        t = end - FADE  # the next segment starts FADE seconds before this one ends (xfade)
        lines.append(f"[{int(start // 60):02d}:{start % 60:04.1f}-{int(end // 60):02d}:{end % 60:04.1f}] "
                     f"{seg['caption_id']} {seg['label']}  ({dur:.0f}s)")
        for cl in textwrap.wrap(seg["caption"], width=100):
            lines.append("    VO: " + cl)
        lines.append(f"    frame: docs/demo/frames/{seg['caption_id']}-{seg['slug']}.png")
        lines.append("")
    p = ROOT / "docs" / "demo-narration.txt"
    p.write_text("\n".join(lines), encoding="utf-8")
    return p


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames-only", action="store_true")
    args = ap.parse_args()

    FRAMES.mkdir(parents=True, exist_ok=True)
    segs = build_segments()
    rendered: list[tuple[pathlib.Path, float]] = []
    for seg in segs:
        p = render(seg)
        rendered.append((p, seg["dur"]))
        print(f"[frame] {p.name}  ({len(seg['lines'])} lines, {seg['dur']:.0f}s)")

    total = sum(s["dur"] for s in segs) - FADE * (len(segs) - 1)
    narr = write_narration(segs, [s["dur"] for s in segs], total)
    print(f"[narration] {narr} — total {total:.1f}s")

    if args.frames_only:
        return 0

    dest = OUT / "escrow-sentinel-demo.mp4"
    cmd = build_video(rendered, dest)
    (OUT / "ffmpeg-command.txt").write_text(cmd + "\n", encoding="utf-8")
    size = dest.stat().st_size
    sha = hashlib.sha256(dest.read_bytes()).hexdigest()
    print(f"[video] {dest}  {size} bytes  sha256={sha}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
