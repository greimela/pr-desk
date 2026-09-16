# PR desk

A local, read-only dashboard for your open GitHub pull requests, with one tab per repository. Runs on macOS, Linux, or Windows with Python 3.9+ and the GitHub CLI installed on PATH. The frontend uses React, TypeScript, Tailwind CSS, and TanStack Query, built with Vite+. It requires Node.js 20.19+, 22.18+, or 24.11+ in the supported release lines, plus pnpm 11.18.0 to build.

## Run

Sign in with `gh auth login`, then run:

```sh
pnpm install --frozen-lockfile
pnpm build
python3 server.py
```

On Windows, use `python` or `py -3` instead of `python3`.

Open http://127.0.0.1:8765. PR desk automatically discovers repositories containing open PRs authored by the signed-in GitHub user. No repository list or configuration file is needed. Discovery runs on every refresh, so repositories appear and disappear as PRs are opened and closed. To view another author, add `--author username`. To change the port, add `--port 9000` or set `PORT`.

## Frontend development

Run `mprocs` from the project directory to start both servers together. This requires `mprocs`, `uv`, and pnpm on PATH. The backend uses `uv tool run --from watchfiles` to obtain an isolated file watcher on first run and restarts whenever `server.py` changes. The frontend uses Vite+ hot reload. Open http://127.0.0.1:5173. Press `q` in the mprocs process list to stop both servers and quit.

Start `python3 server.py` in one terminal and `pnpm dev` in another, then open http://127.0.0.1:5173. Vite+ reloads changes to `index.html` and `src/`. Files in `public/` are copied unchanged into the build.

The development server proxies `/api` to the Python backend on port 8765. For a different backend port, set `API_TARGET`, for example `API_TARGET=http://127.0.0.1:9000 pnpm dev` on macOS/Linux. In PowerShell, use `$env:API_TARGET="http://127.0.0.1:9000"` before running the command.

Run `pnpm build` to update `dist/`, which Python serves at http://127.0.0.1:8765. Run `pnpm preview` to inspect the build on port 4173 with the same API proxy. The Python backend must remain running for API requests in both modes.

Run `pnpm check` for TypeScript, formatting, and lint checks, `pnpm test:frontend` for review/stack and API regression tests, and `python3 -m unittest discover` for backend tests. On Windows, use `python` or `py -3` for the tests. Dependencies are pinned in `pnpm-lock.yaml`; use `pnpm install --frozen-lockfile` for subsequent installs.

## Frontend structure

- `src/App.tsx` owns repository, filter, search, and dialog state.
- `src/PullRequestList.tsx` and `src/PullRequestDetails.tsx` render PRs and their details.
- `src/types.ts` describes the Python API responses; `src/domain.ts` handles review decisions and stacks.
- `src/api.ts` uses TanStack Query to poll every three seconds, retain cached data on connection failures, and refetch after refresh requests. The cache stays in memory.
- Tailwind utility classes provide component styling; `src/style.css` contains shared base styles. `pnpm build` checks types before bundling.

## Behavior

- The default All tab consolidates every PR. Repository tabs filter the list and show per-repository counts and errors. An inaccessible repo does not stop the others loading.
- Click a row to inspect checks, reviews, and discussions. Title links open GitHub.
- PRs are grouped into stacks when a PR targets another listed PR's branch in the same repository. Children appear below parents; stacks sort by their latest update. Filters show only matching PRs.
- Individual approvals appear even if a requested team review is still pending. Dismissed approvals are excluded; changes requested take precedence.
- Failed npm/pnpm audit checks are advisory. Other failures remain red. Pending, skipped, and neutral jobs retain their own status in details.
- General comments have no resolved state on GitHub. Unresolved review threads are counted separately, including Bugbot and human threads.

GitHub.com is supported. Use a CLI account with access to the configured repos. This app does not read Cursor data. Credentials stay with `gh`; no tokens enter the frontend and no PR cache is written to disk. Keep the server local: it binds to loopback and rejects foreign Host/Origin requests. Stop it with Ctrl+C.

## Advanced configuration

No configuration file or repository list is needed for auto-discovery. For saved settings, copy `config.example.json` to `config.json`. This personal config is ignored by Git. Keep `repos` omitted or empty to retain auto-discovery:

```json
{
  "refresh_seconds": 60
}
```

To view another author, set `author` or pass `--author username`. Omit `author` to follow the signed-in account. The refresh interval must be at least 30 seconds. Use `--config path/to/config.json` for another config file.

### Restrict repositories

To replace auto-discovery with a fixed repository list, repeat `--repo`:

```sh
python3 server.py --repo owner/repository --repo owner/another-repository
```

Or save the list in `config.json`:

```json
{
  "repos": ["your-org/your-repo", "your-org/another-repo"],
  "refresh_seconds": 60
}
```

`--repo` and `--author` override saved values. Remove `repos` or set it to `[]` to return to auto-discovery.

### Customize review labels

Team review requests use their team names by default. Add `review_labels` to shorten them per repository without restricting auto-discovery:

```json
{
  "review_labels": {
    "your-org/your-repo": {"security-reviewers": "Security"}
  }
}
```

## Checkout labels

Set `"checkout_paths": ["~/code", "/path/to/a/checkout"]` in your personal `config.json` and restart the backend. Paths may point to a checkout or a directory containing checkouts as immediate children. Linked Git worktrees are included automatically. Relative paths resolve from the dashboard directory; `~` resolves to the current user's home.

Matching PR rows show the checkout folder name, with the full path on hover. Matching uses the PR's source repository and branch, including forks. Detached HEADs and inaccessible paths are skipped. No checkout paths are scanned unless configured. Scanning is read-only and runs on each refresh; it does not fetch or change branches.
