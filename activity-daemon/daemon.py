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

    def do_flush():
        app_entries   = tracker.flush()
        audio_entries = audio_tracker.flush()   # empty list if audio disabled
        # Screen context entries appended here in Issue 18
        upload_batch(api_url, daemon_key, app_entries + audio_entries)

    # ── Hourly check-in ───────────────────────────────────────────────────────
    checkin_mins   = config.get('check_in_interval_minutes', 60)
    assistant_url  = f'{api_url.rstrip("/")}/assistant'

    def do_checkin():
        try:
            res = requests.post(
                f'{api_url.rstrip("/")}/api/checkin',
                headers={'X-Daemon-Key': daemon_key},
                timeout=60,  # AI call can take a moment
            )
            if res.status_code == 401:
                log.error('Check-in rejected — check daemon_api_key in config.toml')
                return
            if not res.ok:
                log.warning(f'Check-in failed: HTTP {res.status_code}')
                return
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
