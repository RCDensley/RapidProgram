"""
App/window focus tracker.
Polls the foreground window every POLL_INTERVAL seconds and aggregates
consecutive identical windows into ActivityEntry records.
"""

import logging
import time
from datetime import datetime
from dataclasses import dataclass, field

log = logging.getLogger('capture.apps')

POLL_INTERVAL = 30  # seconds between samples
NOISE_WINDOWS = {   # window titles/apps to exclude from tracking
    'Task Switching',
    'Windows Default Lock Screen',
    'Screen saver',
    'Screenlock',
}


@dataclass
class WindowSample:
    app_name: str
    window_title: str
    first_seen: float = field(default_factory=time.monotonic)
    last_seen:  float = field(default_factory=time.monotonic)

    @property
    def duration_seconds(self) -> int:
        return max(1, int(self.last_seen - self.first_seen))


def get_active_window() -> dict | None:
    """Return {appName, windowTitle, timestamp} for the current foreground window."""
    try:
        import pygetwindow as gw
        win = gw.getActiveWindow()
        if win is None:
            return None
        title = (win.title or '').strip()
        if not title or title in NOISE_WINDOWS:
            return None
        # Derive app name from title (best effort — no psutil dependency yet)
        app_name = title.split(' - ')[-1].strip() if ' - ' in title else title
        return {
            'appName':     app_name,
            'windowTitle': title,
            'timestamp':   datetime.now().isoformat(timespec='seconds'),
        }
    except Exception as e:
        log.debug(f'get_active_window error: {e}')
        return None


class AppTracker:
    """
    Accumulates window focus samples and produces ActivityEntry dicts on flush.
    Call .sample() every POLL_INTERVAL seconds.
    Call .flush() to retrieve and reset accumulated entries.
    """

    def __init__(self):
        self._current: WindowSample | None = None
        self._completed: list[WindowSample] = []

    def sample(self):
        win = get_active_window()
        if win is None:
            # Window not identifiable — close any open sample
            if self._current:
                self._completed.append(self._current)
                self._current = None
            return

        now = time.monotonic()
        app, title = win['appName'], win['windowTitle']

        if self._current and self._current.app_name == app and self._current.window_title == title:
            # Same window — extend duration
            self._current.last_seen = now
        else:
            # Window changed — close current sample, start new one
            if self._current:
                self._completed.append(self._current)
            self._current = WindowSample(app_name=app, window_title=title,
                                         first_seen=now, last_seen=now)

    def flush(self) -> list[dict]:
        """
        Return all accumulated entries as ActivityEntry dicts and reset state.
        The in-progress window is closed at flush time so its duration is captured.
        It will restart accumulating from the next sample() call.
        """
        # Close the current in-progress window so it's included in this batch
        if self._current:
            self._current.last_seen = time.monotonic()
            self._completed.append(self._current)
            self._current = None

        entries = []
        for s in self._completed:
            entries.append({
                'timestamp':       datetime.now().isoformat(timespec='seconds'),
                'type':            'app_focus',
                'durationSeconds': s.duration_seconds,
                'appName':         s.app_name,
                'windowTitle':     s.window_title,
            })
        self._completed = []
        if entries:
            log.info(f'Flushed {len(entries)} app_focus entries')
        return entries
