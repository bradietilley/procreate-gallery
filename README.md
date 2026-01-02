<p align="center">
  <img src="docs/logo.png" alt="Procreate Gallery" width="128" height="128">
</p>

<h1 align="center">Procreate Gallery</h1>

<p align="center">
  A self-hosted web gallery for browsing, organizing, and discovering your Procreate artwork.
  <br>
  Features automatic thumbnail extraction, AI-powered similarity detection, and a flexible tagging system.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js">
  <img src="https://img.shields.io/badge/Python-3.11-blue" alt="Python">
  <img src="https://img.shields.io/badge/SQLite-3-green" alt="SQLite">
</p>

---

## Features

- **Automatic Ingestion** — Watches a directory for `.procreate` files and automatically extracts thumbnails
- **Similarity Detection** — Uses OpenAI's CLIP model to find visually similar artwork
- **Automatic Color Tagging** — Analyzes artwork and automatically tags with dominant colors
- **Tagging System** — Organize your artwork with custom tags and colors
- **Tag Management** — View, rename, and recolor tags; see all artwork using a specific tag
- **Duplicate Detection** — Identifies duplicate files by content hash
- **File Filtering** — Search by filename, filter by tags, or show only duplicates
- **Keyboard Navigation** — Navigate between artworks with arrow keys, press `T` to quickly add tags

---

## Quick Start with Docker

### 1. Create a `docker-compose.yml`

```yaml
services:
  ui:
    container_name: procreate_ui
    image: ghcr.io/bradietilley/procreate-gallery-ui:latest
    ports:
      - "3000:3000"
    volumes:
      - ./media/procreate:/app/media/procreate:ro
      - ./media/thumbnails:/app/media/thumbnails:ro
      - ./db:/app/db
    environment:
      - NODE_ENV=production
      - PROCREATE_DATABASE_PATH=/app/db/procreate.db
      - PROCREATE_SOURCE_PATH=/app/media/procreate
      - PROCREATE_THUMBNAIL_PATH=/app/media/thumbnails
    depends_on:
      - ingest
    restart: unless-stopped

  ingest:
    container_name: procreate_ingest
    image: ghcr.io/bradietilley/procreate-gallery-ingest:latest
    volumes:
      - ./media/procreate:/app/media/procreate
      - ./media/thumbnails:/app/media/thumbnails
      - ./db:/app/db
    environment:
      - PYTHONUNBUFFERED=1
      - PROCREATE_DATABASE_PATH=/app/db/procreate.db
      - PROCREATE_SOURCE_PATH=/app/media/procreate
      - PROCREATE_THUMBNAIL_PATH=/app/media/thumbnails
      - AUTO_COLOR_TAG=${AUTO_COLOR_TAG:-true}
      - AUTO_COLOR_TAG_LIMIT=${AUTO_COLOR_TAG_LIMIT:-4}
      - AUTO_COLOR_TAG_THRESHOLD=${AUTO_COLOR_TAG_THRESHOLD:-2}
    restart: unless-stopped
```

### 2. Configure Volume Mounts

You need to configure three volume mounts. The **left side** of each mount is the path on your host machine:

| Container Path | Purpose | Access |
| --- | --- | --- |
| `/app/media/procreate` | Your `.procreate` files | Read-only for UI, read-write for ingest |
| `/app/media/thumbnails` | Extracted thumbnail images | Read-only for UI, read-write for ingest |
| `/app/db` | SQLite database | Read-write for both |

**Example:** If your Procreate files are in `/Users/me/Art/Procreate`:

```yaml
volumes:
  - /Users/me/Art/Procreate:/app/media/procreate:ro
  - /Users/me/.procreate-gallery/thumbnails:/app/media/thumbnails:ro
  - /Users/me/.procreate-gallery/db:/app/db
```

#### Mapping Multiple Directories

If your `.procreate` files are spread across multiple directories, map each to a subdirectory inside the container:

```yaml
volumes:
  - /Users/me/Art/Portraits:/app/media/procreate/portraits:ro
  - /Users/me/Art/Landscapes:/app/media/procreate/landscapes:ro
  - /Volumes/ExternalDrive/Procreate:/app/media/procreate/external:ro
  - ./thumbnails:/app/media/thumbnails:ro
  - ./db:/app/db
```

The ingest service recursively scans all subdirectories under `/app/media/procreate`.

### 3. Start the Services

```bash
docker-compose up -d
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `AUTO_COLOR_TAG` | `true` | Enable automatic color tagging on ingestion |
| `AUTO_COLOR_TAG_LIMIT` | `4` | Number of dominant colors to tag per artwork (1–5) |
| `AUTO_COLOR_TAG_THRESHOLD` | `2` | Minimum % of pixels required for a color to qualify |

---

## Usage

### Gallery View

The main gallery displays all your Procreate files as thumbnails. You can:

- **Search** — Filter files by filename using the search box
- **Filter by tags** — Select one or more tags to filter (uses AND logic)
- **Show duplicates** — Toggle to only show files that have duplicates

### Detail View

Click any thumbnail to open the detail view, which shows:

- Full-size preview
- File metadata (name, path, dimensions, time spent, layers, DPI, file size, color profile, Procreate version)
- Tags with the ability to add/remove
- Similar artwork based on CLIP embeddings

### Tag Detail View

Click any tag badge to view the tag detail page, where you can:

- Rename the tag
- Change the tag color
- See all artworks using that tag

### Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `←` / `→` | Navigate to previous/next artwork |
| `T` | Focus the tag input field |
| `Enter` | Add the typed tag |
| `Backspace` | Remove the last tag (when input is empty) |
| `↑` / `↓` | Navigate tag suggestions |

---

## Tagging System

Tags are linked to files by their content hash (`file_hash`), not by file ID. This means:

- **Duplicates share tags** — All copies of the same file automatically have the same tags
- **Tags survive deletion** — If you delete a file and later restore it, the tags are automatically reapplied

### Adding Tags

1. Open a file's detail view
2. Press `T` or click the tag input field
3. Type a tag name and press `Enter`
4. Existing tags appear as suggestions as you type

### Removing Tags

Click the `×` button on any tag, or press `Backspace` when the input is empty to remove the last tag.

### Managing Tags

Visit `/tags` to see all tags with their colors, or click any tag badge anywhere in the app to view and edit that specific tag.

### Automatic Color Tagging

When artwork is ingested, the system automatically analyzes the thumbnail and tags it with the dominant color(s). Available color tags:

- red, orange, yellow, green, blue, purple, pink, black, white, brown, gray

---

## API Reference

### Files

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/procreate` | GET | List all files with tags |
| `/api/procreate/[id]/similar` | GET | Get file details and similar images |
| `/api/procreate/[id]/thumbnail` | GET | Get thumbnail image |
| `/api/procreate/[id]/download` | GET | Download original `.procreate` file |

### Tags

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/tags` | GET | List all tags |
| `/api/tags/[id]` | GET | Get tag details and associated artworks |
| `/api/tags/[id]` | PATCH | Update tag name and/or color |
| `/api/procreate/[id]/tags` | GET | Get tags for a file |
| `/api/procreate/[id]/tags` | POST | Add a tag to a file |
| `/api/procreate/[id]/tags` | DELETE | Remove a tag from a file |
| `/api/tags/purge` | GET | Count orphaned tags |
| `/api/tags/purge` | POST | Delete orphaned tags |

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Web Browser   │────▶│   Next.js App   │
└─────────────────┘     └────────┬────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │     SQLite      │
                       │    Database     │
                       └────────┬────────┘
                                │
                                ▼
┌─────────────────┐     ┌─────────────────┐
│  .procreate     │────▶│ Python Ingest   │
│     Files       │     │    Service      │
└─────────────────┘     └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  CLIP Embeddings │
                       │  (Similarity)    │
                       └─────────────────┘
```

---

## License

MIT

---

## Contributing

Contributions are welcome!

- **Ideas** — Create an Issue
- **Bug Reports** — Create an Issue
- **Bug Fixes / Improvements** — Create a Pull Request

---

<p align="center">
  Made by <strong>Bradie Tilley</strong>
</p>
