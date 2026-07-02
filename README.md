# MY-MULTI-ROOT

This repository stores a VS Code multi-root workspace plus the project links for `samiti` and `BE2`.

The projects are included as Git submodules so the whole stack can be opened from a single repository and used in GitHub Codespaces.

- `samiti` frontend: https://github.com/sammeta07/samiti
- `BE2` backend: https://github.com/sammeta07/BE2

## Getting started

Clone with submodules:

```bash
git clone --recurse-submodules <repo-url>
```

Or, after cloning:

```bash
git submodule update --init --recursive
```