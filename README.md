# MNP Replay

An interactive timeline visualization for Seattle's Monday Night Pinball league matches. View the flow of each match night — picking, responding, game play, score reporting, and confirmations — rendered as a zoomable, scrollable timeline.

## Prerequisites

- Node.js (v18 or later)
- Raw MNP post data files (JSON) in `data/posts/`
- MNP data archive in `mnp-data-archive/` (contains `players.csv` and season directories)

## Setup

Install dependencies for both the build tools and the web server:

```bash
npm install
cd site && npm install
```

## Building

There are two independent build steps. You can run them together or separately.

### Build everything

```bash
npm run build
```

### Build the app version only

```bash
npm run build:site
```

Writes `data/version.json` with the current git version (from `git describe --tags --always`). Run this after making changes to the site code to bust the static asset cache.

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--output <filename>` | `data/version.json` | Output file path |

### Build the match data only

```bash
npm run build:data
```

Processes all post files from `data/posts/`, enriches them with player names from `mnp-data-archive/players.csv` and venue data from the season archives, and writes the result to `data/mnp-timeline.json`. This can take a while with large datasets.

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--output <filename>` | `data/mnp-timeline.json` | Output file path |
| `--posts <directory>` | `data/posts` | Directory containing raw post JSON files |
| `--mnp-data-archive <directory>` | `mnp-data-archive` | Directory containing players.csv and season archives |

Example with custom paths:

```bash
node build-data.js --posts /tmp/posts --mnp-data-archive /tmp/mnp-data-archive --output /tmp/mnp-timeline.json
```

## Running the Server

```bash
node site/server.js
```

The server starts on port 3000 by default. Open http://localhost:3000 in a browser.

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--port <number>` | `3000` | Server port number |
| `--proxy-prefix <prefix>` | *(empty)* | URL prefix for API routes when running behind a reverse proxy |

When running behind a reverse proxy (e.g., nginx) that forwards `/mnp-timeline/*` to this server:

```bash
node site/server.js --proxy-prefix /mnp-timeline
```

The prefix is injected into the client so API calls route through the proxy correctly. When accessing the server directly, omit this flag.

## Using the Timeline

- **Filters**: Use the Season, Week, and Venue dropdowns to select which matches to display. The dropdowns cascade — changing the season updates the available weeks, and changing the week updates the available venues. Select `(all)` for venue to show all matches for that week.
- **Zoom and pan**: Scroll to zoom in/out on the timeline. Click and drag to pan.
- **Tooltips**: Hover over any event bar to see details. Game bars show player names and scores.
- **Event types**:
  - **Blue** — Picking phase (team selects machines)
  - **Orange** — Responding phase (opponent assigns players)
  - **Green** — Game reported (scores submitted)
  - **Purple** — Score confirmation
  - **Teal** — Lineup confirmation
  - **Red bands** — Round breaks

## Caching

- **Static assets** (CSS, JS) are cached for 1 week. Run `npm run build:site` and restart the server to bust the cache after code changes.
- **API responses** are cached for 1 week. The client appends a `?v={buildDate}` parameter from the data's build date. Rebuilding the data (`npm run build:data`) and restarting the server busts the API cache.
- **The version endpoint** (`/api/version`) is never cached, ensuring the client always picks up version changes.

## Versioning

Version numbers are generated automatically from git tags using `git describe --tags --always`. Create annotated or lightweight tags to set version milestones:

```bash
git tag v1.2.0
npm run build:site   # Updates version.json
```

After additional commits, the version will look like `v1.2.0-3-gabcdef0` (3 commits past the tag, at commit abcdef0).
