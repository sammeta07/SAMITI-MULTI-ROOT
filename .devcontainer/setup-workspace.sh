#!/usr/bin/env bash
set -euo pipefail

pushd samiti >/dev/null
npm install
popd >/dev/null

pushd BE2 >/dev/null
npm install
popd >/dev/null