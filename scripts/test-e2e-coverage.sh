#!/usr/bin/env bash
# Builds the extension with babel-plugin-istanbul instrumentation baked in
# (COVERAGE=true, see webpack.config.js), runs the e2e suite collecting the
# resulting globalThis.__coverage__ from every JS realm involved
# (support/coverage.mjs only collects when E2E_COVERAGE_DIR is set), then
# merges and reports it. See test/e2e/support/reportCoverage.mjs for what
# "report" means here (100%-per-file enforcement, HTML report).
set -e

rm -rf .coverage-e2e-raw coverage/e2e

COVERAGE=true MANIFEST_V3=true webpack

export E2E_COVERAGE_DIR=.coverage-e2e-raw
node --import ./test-support/register-hooks.mjs --test test/e2e/*.test.mjs
node test/e2e/support/reportCoverage.mjs
