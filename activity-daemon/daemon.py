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

    # Capture and upload jobs are registered here as issues 13-16 are implemented.
    # For now the scheduler loop is in place and ready to receive jobs.

    log.info('Scheduler running — Ctrl+C to stop')
    try:
        while True:
            schedule.run_pending()
            time.sleep(1)
    except KeyboardInterrupt:
        log.info('Daemon stopped.')


if __name__ == '__main__':
    main()
