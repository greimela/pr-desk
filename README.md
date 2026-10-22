# PR desk

A local dashboard that automatically finds your open GitHub pull requests and the non-draft pull requests waiting for your review, including requests to your teams. Browse by repository, inspect reviews and checks, copy branch names, and retry failed GitHub Actions jobs.

## Run

Requires Python 3.9+, the GitHub CLI (`gh`), Node.js 20.19+ / 22.18+ / 24.11+, and pnpm 11.18.0.

```sh
gh auth login
pnpm install --frozen-lockfile
pnpm build
python3 server.py
```

Open [localhost:8765](http://127.0.0.1:8765). Repositories are discovered on each refresh using your signed-in GitHub account. No configuration file is needed.

On Windows, use `python` or `py -3` instead of `python3`. Stop the server with Ctrl+C.

On macOS, `scripts/install-app.sh` builds the frontend and creates `~/Applications/PR Desk.app`. Opening it starts the server if needed and opens the dashboard in a browser tab. The app stays in the Dock while it runs; click its icon to open another tab, and quit it to stop the server it started. Right-click the Dock icon and choose Options › Keep in Dock for one-click access. The server logs to `~/Library/Logs/pr-desk.log`. Re-run the script after pulling changes. To start the server in the background without the app, run `scripts/open.sh`.

## Advanced configuration

Use `--author username` to view another author's PRs or `--port 9000` to change the port. To use a fixed repository list instead of auto-discovery:

```sh
python3 server.py --repo owner/repository --repo owner/another-repository
```

For saved settings, copy `config.example.json` to `config.json`, which is ignored by Git. All settings are optional:

| Setting | Purpose |
| --- | --- |
| `author` | GitHub username; defaults to the signed-in account. |
| `repos` | Fixed list of `owner/repository` names. Omit or use `[]` for auto-discovery. |
| `refresh_seconds` | Refresh interval, default 60, minimum 30. |
| `review_labels` | Team label overrides, e.g. `{"owner/repo": {"team-slug": "Label"}}`. |
| `watch_deployments` | Show the latest deployment while it waits for approval, runs or has failed, and for an hour after it succeeds, e.g. `{"owner/repo": ["prod-mainnet"]}`. |
| `watch_scheduled_workflows` | Show a banner while the latest finished scheduled run of a workflow has failed, e.g. `{"owner/repo": ["nightly.yml"]}`. |

`--repo` and `--author` override saved settings. Use `--config path/to/config.json` to load another file.

## Development

Run `mprocs` to start both servers with automatic reloads. Requires `mprocs` and `uv` in addition to the dependencies above. Alternatively, run `python3 server.py` and `pnpm dev` in separate terminals.

Open [localhost:5173](http://127.0.0.1:5173). If the backend uses a different port, set `API_TARGET` to its URL.

```sh
pnpm check
pnpm test:frontend
python3 -m unittest discover
pnpm build
```
