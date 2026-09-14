# PR desk

A local, read-only dashboard for your open GitHub pull requests, with one tab per repository. Runs on macOS, Linux, or Windows with Python 3.9+ and the GitHub CLI installed on PATH. No npm installation is needed.

## Run

Sign in with `gh auth login`, then run:

```sh
python3 server.py
```

On Windows, use `python` or `py -3` instead of `python3`.

Open http://127.0.0.1:8765. PR desk automatically discovers repositories containing open PRs authored by the signed-in GitHub user. Discovery runs on every refresh, so repositories appear and disappear as PRs are opened and closed. To view another author, add `--author username`. To change the port, add `--port 9000` or set `PORT`.

To restrict the dashboard to specific repositories, repeat `--repo`:

```sh
python3 server.py --repo owner/repository --repo owner/another-repository
```

For saved settings, copy `config.example.json` to `config.json`. This personal config is ignored by Git. If `repos` is omitted or empty, repositories are auto-discovered. `--repo` and `--author` override saved values. Use `--config path/to/config.json` for another config file.

```json
{
  "repos": ["your-org/your-repo", "your-org/another-repo"],
  "refresh_seconds": 60,
  "review_labels": {
    "your-org/your-repo": {"security-reviewers": "Security"}
  }
}
```

`repos` and `author` are optional. Omit `repos` to auto-discover repositories and omit `author` to follow the signed-in account. The refresh interval must be at least 30 seconds. Team review requests use their team names by default; `review_labels` can shorten them per repository. The existing ent-wallet personal config maps `actions-reviewers` to `IPS`.

## Behavior

- The default All tab consolidates every PR. Repository tabs filter the list and show per-repository counts and errors. An inaccessible repo does not stop the others loading.
- Click a row to inspect checks, reviews, and discussions. Title links open GitHub.
- PRs are grouped into stacks when a PR targets another listed PR's branch in the same repository. Children appear below parents; stacks sort by their latest update. Filters show only matching PRs.
- Individual approvals appear even if a requested team review is still pending. Dismissed approvals are excluded; changes requested take precedence.
- Failed npm/pnpm audit checks are advisory. Other failures remain red. Pending, skipped, and neutral jobs retain their own status in details.
- General comments have no resolved state on GitHub. Unresolved review threads are counted separately, including Bugbot and human threads.

GitHub.com is supported. Use a CLI account with access to the configured repos. This app does not scan local checkouts or read Cursor data. Credentials stay with `gh`; no tokens enter the frontend and no PR cache is written to disk. Keep the server local: it binds to loopback and rejects foreign Host/Origin requests. Stop it with Ctrl+C.
