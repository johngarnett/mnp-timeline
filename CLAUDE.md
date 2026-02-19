# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MNP Replay visualizes Seattle's Monday Night Pinball League match timelines. It ingests raw JSON event posts from pinball tournaments, processes them into structured data, and serves an interactive vis-timeline visualization via Express.

## Build Commands

```bash
npm run build          # Runs build:site then build:data
npm run build:site     # Writes data/version.json from git describe
npm run build:data     # Processes posts into data/mnp-timeline.json
```

### build-data.js CLI flags
- `--output <filename>` (default: `data/mnp-timeline.json`)
- `--mnp-data-archive <directory>` (default: `mnp-data-archive`)
- `--posts <directory>` (default: `data/posts`)

### build-version.js CLI flags
- `--output <filename>` (default: `data/version.json`)

## Running the Server

```bash
node site/server.js                              # Direct access at localhost:3000
node site/server.js --port 8080                   # Custom port
node site/server.js --proxy-prefix /mnp-timeline  # Behind reverse proxy
```

## Testing

### Unit tests
Unit tests use the Node.js built-in test runner (`node:test` and `node:assert/strict`). No additional dependencies required.
```bash
npm test                          # Run all unit tests
node --test tests/*.test.js       # Equivalent direct command
```

Test files live in `tests/` and follow the `*.test.js` naming convention. Tests cover pure functions exported from `load-posts.js` and `site/server.js`.

To add new unit tests:
- Create a `tests/<module>.test.js` file
- Import `describe` and `it` from `node:test`, `assert` from `node:assert/strict`
- Export any pure functions you need to test from the source module
- The `npm test` glob (`tests/*.test.js`) picks up new files automatically

### Playwright UI tests
Playwright UI tests require the server to be running on localhost:3000 first:
```bash
node tests/tooltip-test.js
```

## Architecture

### Two-stage build pipeline
1. **build-version.js** writes `data/version.json` with `git describe --tags --always` output. Used for static asset cache busting.
2. **build-data.js** calls `loadPosts()` from `load-posts.js`, which reads 65K+ JSON files from `data/posts/`, enriches with player names from `mnp-data-archive/players.csv` and venue data from season archives, then writes `data/mnp-timeline.json` (~50MB).

### Data flow
`data/posts/*.json` → `load-posts.js` (parse, merge, deduplicate) → `build-data.js` (toArrays, add metadata) → `data/mnp-timeline.json` → `site/server.js` (resolve player names, serve API) → `site/public/js/timeline.js` (vis-timeline rendering)

### Server template injection
`index.html` contains `%%BUILD_VERSION%%` and `%%PROXY_PREFIX%%` placeholders. The `GET /` route serves the processed HTML; `express.static` serves CSS/JS with 1-week cache. API responses are cached for 1 week with `?v={buildDate}` cache busting.

### Data model
Seasons → Weeks → Matches → Rounds → Machines → Players/Scores. Events are merged chronologically: multiple picking/responding posts per round get layered together. Score confirmations are assigned retroactively to the nearest prior picking event.

### vis-timeline tooltip caveat
The vis-timeline library strips `class` attributes from tooltip HTML. All tooltip styling must use `.vis-tooltip` parent selectors (e.g., `.vis-tooltip table`) not class-based selectors.

## Code Conventions

- No semicolons at line ends
- 3-space indentation
- CommonJS modules (require/module.exports)
- Named constants instead of magic numbers
- Commander.js for all CLI argument parsing
- Seattle timezone (America/Los_Angeles) for displayed timestamps
- `epoch` for millisecond timestamps, `local` for formatted Seattle time strings
- Unknown player IDs display as last 7 characters of the hash
