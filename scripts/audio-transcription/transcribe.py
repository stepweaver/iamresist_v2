#!/usr/bin/env python3
"""CPU-only faster-whisper worker for local podcast transcription fallback.

Prints a JSON object to stdout:
  { provider, model, version, language, segments: [{index, startSeconds, endSeconds, text}] }

Does not rewrite transcript wording. Logs go to stderr.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

VERSION = "creator-notes-whisper-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Transcribe local audio with faster-whisper")
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default="en")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    return parser.parse_args()


def main() -> int:
    logging.getLogger("faster_whisper").setLevel(logging.WARNING)
    args = parse_args()
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "faster-whisper is not installed. Run: python3 -m pip install -r scripts/audio-transcription/requirements.txt",
            file=sys.stderr,
        )
        return 2

    language = args.language.strip() or None
    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    segments_iter, info = model.transcribe(
        args.audio,
        language=language,
        vad_filter=True,
        beam_size=1,
        word_timestamps=False,
    )

    segments = []
    for seg in segments_iter:
        text = (seg.text or "").strip()
        if not text:
            continue
        segments.append(
            {
                "index": len(segments),
                "startSeconds": None if seg.start is None else float(seg.start),
                "endSeconds": None if seg.end is None else float(seg.end),
                "text": text,
            }
        )

    payload = {
        "provider": "faster-whisper",
        "model": args.model,
        "version": VERSION,
        "language": getattr(info, "language", language),
        "segments": segments,
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
