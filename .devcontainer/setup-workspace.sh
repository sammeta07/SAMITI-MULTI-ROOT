#!/usr/bin/env bash
set -euo pipefail

git submodule update --init --recursive

pushd samiti >/dev/null
npm install
popd >/dev/null

pushd BE2 >/dev/null
npm install
popd >/dev/null