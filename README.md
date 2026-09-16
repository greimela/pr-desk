# PR desk

A local dashboard that automatically finds your open GitHub pull requests. Browse by repository, inspect reviews and checks, copy branch names, and retry failed GitHub Actions jobs.

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
| `checkout_paths` | Local checkouts or their parent directories; matching PRs show the folder name. |
| `review_labels` | Team label overrides, e.g. `{"owner/repo": {"team-slug": "Label"}}`. |

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
