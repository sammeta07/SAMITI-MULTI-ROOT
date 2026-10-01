# MY-MULTI-ROOT

This repository stores a VS Code multi-root workspace and includes the full source code for both projects.

Both codebases are embedded directly in this repository so the full stack can be cloned and opened in one place (including GitHub Codespaces).

- `samiti` frontend: https://github.com/sammeta07/samiti
- `BE2` backend: https://github.com/sammeta07/BE2

## Getting started

Clone normally:

```bash
git clone <repo-url>
```

### Run the frontend and backend

Open a terminal in the repository and run:

```bash
bash .devcontainer/start-workspace.sh
```

The frontend and backend run in that terminal. Press `Ctrl+C` or close the
terminal to stop both services. The VS Code Ports tab may still show a
forwarded-port entry briefly; that entry does not mean the app server is still
running. Ports used internally by VS Code extensions are separate from these
app services.