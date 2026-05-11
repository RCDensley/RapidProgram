# PM Tracker Activity Daemon

Local background daemon that monitors your activity and sends it to PM Tracker's Activity API.

## Requirements

- Windows 11
- Python 3.11+
- PM Tracker deployed with `DAEMON_API_KEY` set in Azure App Settings

## Setup

```powershell
# 1. Install dependencies
cd activity-daemon
pip install -e .

# 2. Configure
copy config.example.toml config.toml
# Edit config.toml — set api_url, daemon_api_key, member_initials

# 3. Run
python daemon.py
```

Or with [uv](https://docs.astral.sh/uv/):
```powershell
uv sync
uv run daemon.py
```

## Configuration (`config.toml`)

| Key | Description |
|-----|-------------|
| `api_url` | PM Tracker URL, e.g. `https://proud-ocean-0339de800.7.azurestaticapps.net` |
| `daemon_api_key` | The `DAEMON_API_KEY` value from Azure App Settings |
| `member_initials` | Your initials as they appear in PM Tracker resources (e.g. `CDensley`) |
| `batch_interval_minutes` | How often to POST activity batches (default: 15) |
| `check_in_interval_minutes` | How often to trigger an AI check-in (default: 60) |

`config.toml` is gitignored — never commit it (it contains your API key).

## Running on startup (optional)

Use Windows Task Scheduler to run `python daemon.py` at logon:

1. Open Task Scheduler → Create Basic Task
2. Trigger: **When I log on**
3. Action: Start a program → `python.exe`, arguments: `C:\path\to\activity-daemon\daemon.py`
4. Check "Run only when user is logged on"
