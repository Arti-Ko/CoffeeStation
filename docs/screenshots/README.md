# Screenshots

Drop PNG screenshots into this folder and they'll auto-appear in the main README. Recommended size: **2560×1600** retina (or whatever your display is). PNG, not JPG — text needs to stay crisp.

| File | What it should show |
|---|---|
| `01-knowledge-base.png` | The default landing view — knowledge-base grid with several notes, folders visible in the left panel |
| `02-note-editor.png` | A note open in the editor with rich content (heading, list, image or table, wikilinks visible) |
| `03-kanban.png` | The Kanban board with multiple cards across columns |
| `04-knowledge-graph.png` | The knowledge graph view with several connected nodes |
| `05-files.png` | The File view with thumbnails, ideally a PDF or video preview open |
| `06-theme-studio.png` | The Theme Studio open with the OKLCH color picker visible |

## How to capture (macOS)

```bash
# Capture the active window (Cmd+Shift+4, then Space, then click the window):
# saves to ~/Desktop by default, then drag here.

# Or capture a specific region:
screencapture -i ~/Desktop/01-knowledge-base.png
```

Strip the macOS window shadow with `-w` (use the keyboard interactive mode) or `magick mogrify -trim *.png` if you have ImageMagick.
