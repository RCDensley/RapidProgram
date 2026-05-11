"""
Periodic screen capture with AI visual tagging.

Every CAPTURE_INTERVAL seconds, takes a screenshot of the primary monitor
at reduced resolution, sends it to /api/ai for a one-line description, and
stores only that text description as a screen_context ActivityEntry.
Raw images are never written to disk or stored in the activity log.
"""

import base64
import io
import json
import logging
import requests
from datetime import datetime

log = logging.getLogger('capture.screen')

CAPTURE_INTERVAL = 600     # seconds between captures (10 min)
JPEG_QUALITY     = 60      # balance detail vs payload size
SCALE_FACTOR     = 0.5     # resize to 50% before encoding

VISION_PROMPT = (
    'Describe in one sentence what the user is doing on screen. '
    'Focus on: application name, task type, any visible project or document names. '
    'Be brief and factual. Reply with only the description, no preamble.'
)


def capture_screen() -> bytes:
    """Capture primary monitor and return as a JPEG byte string at reduced size."""
    import mss
    from PIL import Image

    with mss.mss() as sct:
        monitor = sct.monitors[1]   # primary monitor
        raw     = sct.grab(monitor)

    img  = Image.frombytes('RGB', raw.size, raw.rgb)
    w, h = img.size
    img  = img.resize((int(w * SCALE_FACTOR), int(h * SCALE_FACTOR)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=JPEG_QUALITY)
    return buf.getvalue()


def describe_screen(api_url: str, daemon_key: str) -> str | None:
    """
    Capture the screen, send to /api/ai for vision description, return text.
    Returns None if the screen is locked or any step fails.
    """
    try:
        jpeg_bytes = capture_screen()
    except Exception as e:
        log.debug(f'Screen capture skipped: {e}')
        return None

    b64    = base64.b64encode(jpeg_bytes).decode()
    data_url = f'data:image/jpeg;base64,{b64}'

    # Build a vision message — /api/ai already supports input_image blocks
    payload = {
        'messages': [
            {
                'role': 'user',
                'content': [
                    {'type': 'input_image', 'image_url': data_url},
                    {'type': 'input_text',  'text': VISION_PROMPT},
                ],
            }
        ]
    }

    try:
        res = requests.post(
            f'{api_url.rstrip("/")}/api/ai',
            json=payload,
            headers={
                'Content-Type': 'application/json',
                'X-Daemon-Key': daemon_key,
            },
            stream=True,
            timeout=30,
        )
        if not res.ok:
            log.debug(f'Vision API {res.status_code}')
            return None

        # SSE stream — collect all deltas
        description = ''
        for line in res.iter_lines():
            if not line:
                continue
            text = line.decode('utf-8', errors='ignore')
            if text == 'data: [DONE]' or not text.startswith('data: '):
                continue
            try:
                j = json.loads(text[6:])
                if j.get('delta'):
                    description += j['delta']
            except Exception:
                pass

        description = description.strip()
        if description:
            log.info(f'Screen: {description[:80]}{"…" if len(description) > 80 else ""}')
        return description or None

    except Exception as e:
        log.debug(f'Vision call failed: {e}')
        return None


def screen_entry(api_url: str, daemon_key: str) -> dict | None:
    """
    Run a screen capture + description. Returns an ActivityEntry dict or None.
    Intended to be called by the daemon scheduler every CAPTURE_INTERVAL seconds.
    """
    description = describe_screen(api_url, daemon_key)
    if not description:
        return None
    return {
        'timestamp':  datetime.now().isoformat(timespec='seconds'),
        'type':       'screen_context',
        'screenTags': description,
    }
