"""
PM Tracker Activity Daemon
--------------------------
Monitors local activity (app focus, audio, screen) and periodically
posts batches to the PM Tracker API. Run with: python daemon.py
"""

import sys
import logging
import tomllib
import schedule
import time
from pathlib import Path
import requests
from capture.apps import AppTracker, POLL_INTERVAL
from capture.audio import AudioTracker
from capture.screen import screen_entry, CAPTURE_INTERVAL as SCREEN_INTERVAL
from uploader import upload_batch
from notifier import notify_checkin

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-8s  %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger('daemon')

CONFIG_PATH = Path(__file__).parent / 'config.toml'

REQUIRED_KEYS = ('api_url', 'daemon_api_key', 'member_initials')


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        log.error(f'Config file not found: {CONFIG_PATH}')
        log.error('Copy config.example.toml to config.toml and fill in your values.')
        sys.exit(1)

    try:
        with open(CONFIG_PATH, 'rb') as f:
            config = tomllib.load(f)
    except Exception as e:
        log.error(f'Failed to parse config.toml: {e}')
        sys.exit(1)

    missing = [k for k in REQUIRED_KEYS if not config.get(k)]
    if missing:
        log.error(f'config.toml is missing required keys: {", ".join(missing)}')
        sys.exit(1)

    # Warn (don't exit) if api_url looks wrong — daemon can still start
    if not config['api_url'].startswith('http'):
        log.warning(f'api_url does not look like a URL: {config["api_url"]}')

    return config


def main():
    config = load_config()

    log.info('Daemon started')
    log.info(f'  API:            {config["api_url"]}')
    log.info(f'  Member:         {config["member_initials"]}')
    log.info(f'  Batch interval: {config.get("batch_interval_minutes", 15)} min')
    log.info(f'  Check-in:       {config.get("check_in_interval_minutes", 60)} min')

    api_url    = config['api_url']
    daemon_key = config['daemon_api_key']
    batch_mins = config.get('batch_interval_minutes', 15)

    # ── App/window tracker ────────────────────────────────────────────────────
    tracker = AppTracker()

    # ── Audio tracker (loads models in background; disables itself if unavailable)
    audio_tracker = AudioTracker()
    audio_tracker.start()

    def do_sample():
        tracker.sample()

    # Screen capture entries collected here and appended at flush time
    _pending_screen: list[dict] = []

    def do_screen_capture():
        entry = screen_entry(api_url, daemon_key)
        if entry:
            _pending_screen.append(entry)

    def do_flush():
        app_entries    = tracker.flush()
        audio_entries  = audio_tracker.flush()
        screen_entries = list(_pending_screen); _pending_screen.clear()
        upload_batch(api_url, daemon_key, app_entries + audio_entries + screen_entries)

    # ── Hourly check-in ───────────────────────────────────────────────────────
    checkin_mins   = config.get('check_in_interval_minutes', 60)
    assistant_url  = f'{api_url.rstrip("/")}/assistant'

    def do_checkin():
        from datetime import datetime as _dt
        _now = _dt.now()
        local_title = f'{_now.strftime("%H:%M")} Check-in · {_now.day} {_now.strftime("%b")}'
        try:
            res = requests.post(
                f'{api_url.rstrip("/")}/api/checkin',
                json={'title': local_title},
                headers={'X-Daemon-Key': daemon_key},
                timeout=60,
            )
            if res.status_code == 401:
                log.error('Check-in rejected — check daemon_api_key in config.toml')
                return
            if not res.ok:
                log.warning(f'Check-in failed: HTTP {res.status_code}')
                return
            log.info(f'Check-in raw response ({res.status_code}): {res.text[:400]}')
            result  = res.json()
            title   = result.get('title', 'Check-in ready')
            log.info(f'Check-in created: {title}')
            notify_checkin(title, assistant_url)
        except requests.RequestException as e:
            log.warning(f'Check-in error (will retry next interval): {e}')
        except Exception as e:
            log.error(f'Check-in unexpected error: {e}')

    # Sample every POLL_INTERVAL seconds
    schedule.every(POLL_INTERVAL).seconds.do(do_sample)

    # Flush and upload every batch_interval_minutes
    schedule.every(batch_mins).minutes.do(do_flush)

    # Screen capture every CAPTURE_INTERVAL seconds (default 10 min)
    schedule.every(SCREEN_INTERVAL).seconds.do(do_screen_capture)

    # Trigger check-in every check_in_interval_minutes
    schedule.every(checkin_mins).minutes.do(do_checkin)

    log.info('Scheduler running — Ctrl+C to stop')
    try:
        while True:
            schedule.run_pending()
            time.sleep(1)
    except KeyboardInterrupt:
        log.info('Flushing final batch before exit…')
        audio_tracker.stop()
        do_flush()
        log.info('Daemon stopped.')


if __name__ == '__main__':
    main()
