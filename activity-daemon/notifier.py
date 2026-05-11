"""
Windows toast notifications for PM Tracker daemon.
Uses winotify for clickable notifications with a launch URL.
Fails silently on any error so notification issues never crash the daemon.
"""

import logging

log = logging.getLogger('notifier')


def notify_checkin(title: str, assistant_url: str):
    """
    Show a clickable Windows toast notification for a completed check-in.
    Clicking the notification opens the Assistant tab in the browser.
    """
    try:
        from winotify import Notification
        toast = Notification(
            app_id='PM Tracker',
            title=f'📋 {title}',
            msg='Your activity check-in is ready — click to open the Assistant.',
            duration='short',
            launch=assistant_url,
        )
        toast.show()
        log.info(f'Notification shown: {title}')
    except ImportError:
        log.debug('winotify not available — skipping notification')
    except Exception as e:
        log.debug(f'Notification error (non-fatal): {e}')
