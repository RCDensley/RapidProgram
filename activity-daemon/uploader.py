"""
Activity batcher and uploader.
Collects entries from all capture streams, builds an ActivityBatch, and
POSTs it to /api/activity. Failed uploads are queued to pending-batches.jsonl
and retried on the next flush.
"""

import json
import logging
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Melbourne / AEST+11 (AEDT) — local time used for all display timestamps
_LOCAL_TZ = datetime.now().astimezone().tzinfo

log = logging.getLogger('uploader')

PENDING_PATH = Path(__file__).parent / 'pending-batches.jsonl'
MAX_PENDING_AGE_HOURS = 24


def _today() -> str:
    return datetime.now().strftime('%Y-%m-%d')

def _now_time() -> str:
    return datetime.now().strftime('%H:%M')


def upload_batch(api_url: str, daemon_key: str, entries: list[dict]) -> bool:
    """
    Build an ActivityBatch from entries and POST to /api/activity.
    Returns True on success, False on failure (batch is queued for retry).
    """
    if not entries:
        return True

    batch = {
        'date':     _today(),
        'fromTime': entries[0]['timestamp'][11:16] if entries else _now_time(),
        'toTime':   _now_time(),
        'entries':  entries,
    }

    # Try live upload first, then any queued batches
    success = _post(api_url, daemon_key, batch)
    if not success:
        _enqueue(batch)
        return False

    _drain_queue(api_url, daemon_key)
    return True


def _post(api_url: str, daemon_key: str, batch: dict) -> bool:
    try:
        res = requests.post(
            f'{api_url.rstrip("/")}/api/activity',
            json=batch,
            headers={'X-Daemon-Key': daemon_key},
            timeout=15,
        )
        if res.status_code == 401:
            log.error('Upload rejected — check daemon_api_key in config.toml')
            return False
        if not res.ok:
            log.warning(f'Upload failed: HTTP {res.status_code} — {res.text[:120]}')
            return False
        result = res.json()
        log.info(f'Uploaded {len(batch["entries"])} entries — total today: {result.get("count", "?")}')
        return True
    except requests.RequestException as e:
        log.warning(f'Upload error (will retry): {e}')
        return False


def _enqueue(batch: dict):
    try:
        with open(PENDING_PATH, 'a', encoding='utf-8') as f:
            f.write(json.dumps(batch) + '\n')
        log.info(f'Queued batch for retry ({PENDING_PATH.name})')
    except Exception as e:
        log.error(f'Failed to queue batch: {e}')


def _drain_queue(api_url: str, daemon_key: str):
    if not PENDING_PATH.exists():
        return
    try:
        lines = PENDING_PATH.read_text(encoding='utf-8').splitlines()
    except Exception:
        return

    cutoff = datetime.now(timezone.utc).timestamp() - MAX_PENDING_AGE_HOURS * 3600
    remaining = []
    drained = 0

    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            batch = json.loads(line)
            # Prune stale batches (older than MAX_PENDING_AGE_HOURS)
            batch_date = batch.get('date', '')
            if batch_date < _today()[:10] and _is_stale(batch_date, cutoff):
                log.debug(f'Pruning stale pending batch: {batch_date}')
                continue
            if _post(api_url, daemon_key, batch):
                drained += 1
            else:
                remaining.append(line)
        except Exception:
            remaining.append(line)

    if drained:
        log.info(f'Drained {drained} pending batch(es)')

    if remaining:
        PENDING_PATH.write_text('\n'.join(remaining) + '\n', encoding='utf-8')
    else:
        PENDING_PATH.unlink(missing_ok=True)


def _is_stale(date_str: str, cutoff_ts: float) -> bool:
    try:
        dt = datetime.strptime(date_str, '%Y-%m-%d')
        return dt.timestamp() < cutoff_ts
    except Exception:
        return True
