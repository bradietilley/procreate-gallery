#!/usr/bin/env python3
"""
Local Procreate metadata extraction API.

Commands:
  inspect <path.procreate>   - Extract metadata from a .procreate file
  vector <path.png>          - Extract CLIP vector embedding from a thumbnail
  clear-temp [--days N]      - Clean up old temp files
"""

import sys
import json
import time
import tempfile
import zipfile
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional
import hashlib

from PIL import Image
import biplist

# Lazy imports for CLIP (heavy dependencies)
torch = None
clip = None

def _ensure_clip():
    global torch, clip
    if torch is None:
        import torch as _torch
        import clip as _clip
        torch = _torch
        clip = _clip

# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------

TEMP_DIR = Path(tempfile.gettempdir()) / "procreate_meta"
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# CLIP model (lazy loaded)
_clip_model = None
_clip_preprocess = None
_clip_device = None

def get_clip_model():
    """Lazy-load CLIP model on first use."""
    global _clip_model, _clip_preprocess, _clip_device
    _ensure_clip()
    if _clip_model is None:
        _clip_device = "cuda" if torch.cuda.is_available() else "cpu"
        _clip_model, _clip_preprocess = clip.load("ViT-B/32", device=_clip_device)
        _clip_model.eval()
    return _clip_model, _clip_preprocess, _clip_device

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def cfuid(obj):
    """Resolve CF$UID references. Handles both dict and Uid object formats."""
    if isinstance(obj, dict) and "CF$UID" in obj:
        return obj["CF$UID"]
    # biplist returns Uid objects directly in some versions
    if hasattr(obj, '__class__') and obj.__class__.__name__ == 'Uid':
        return int(obj)
    if isinstance(obj, biplist.Uid):
        return int(obj)
    return None

def resolve(objects, value):
    uid = cfuid(value)
    return objects[uid] if uid is not None else value

def compute_sha256(path: Path, chunk_size: int = 1024 * 1024) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            sha.update(chunk)
    return sha.hexdigest()

# -----------------------------------------------------------------------------
# NSKeyedArchive parsing
# -----------------------------------------------------------------------------

def parse_document_archive(data: bytes, zf: "zipfile.ZipFile | None" = None) -> Dict[str, Any]:
    plist = biplist.readPlistFromString(data)

    objects = plist["$objects"]
    top = plist["$top"]
    
    # Handle both dict {"CF$UID": int} and Uid object formats
    root_ref = top["root"]
    root_uid = cfuid(root_ref)
    if root_uid is None:
        raise RuntimeError(f"Could not resolve root UID from: {root_ref}")
    root = objects[root_uid]

    meta = {}

    # Canvas size - try both old and new key names
    # Old format: canvasSize -> {width, height}
    # New format: size -> resolve to get {width, height} or "{width, height}" string
    canvas = resolve(objects, root.get("canvasSize") or root.get("size"))
    if isinstance(canvas, dict):
        meta["canvas_width"] = int(canvas.get("width", 0))
        meta["canvas_height"] = int(canvas.get("height", 0))
    elif isinstance(canvas, str):
        # Parse "{width, height}" format
        try:
            clean = canvas.strip("{}")
            parts = [p.strip() for p in clean.split(",")]
            if len(parts) == 2:
                meta["canvas_width"] = int(float(parts[0]))
                meta["canvas_height"] = int(float(parts[1]))
        except:
            meta["canvas_width"] = 0
            meta["canvas_height"] = 0
    else:
        meta["canvas_width"] = 0
        meta["canvas_height"] = 0

    # DPI - try both old and new key names
    dpi = root.get("dpi") or root.get("SilicaDocumentArchiveDPIKey")
    meta["dpi"] = int(dpi) if dpi else 0

    # Orientation
    orientation_map = {
        1: "portrait",
        2: "landscape",
    }
    meta["orientation"] = orientation_map.get(
        root.get("orientation"), "unknown"
    )

    # Layer count - try old key or count layers array
    layer_count = root.get("layerCount")
    if layer_count is None:
        layers_ref = root.get("layers")
        if layers_ref:
            layers = resolve(objects, layers_ref)
            if isinstance(layers, dict) and "NS.objects" in layers:
                layer_count = len(layers["NS.objects"])
            elif isinstance(layers, list):
                layer_count = len(layers)
    meta["layer_count"] = int(layer_count) if layer_count else 0

    # Time spent drawing (seconds) - try both old and new key names
    time_spent = root.get("timeSpentDrawing") or root.get("SilicaDocumentTrackedTimeKey")
    meta["time_spent"] = int(time_spent) if time_spent else 0

    # Color profile - try multiple approaches
    color_profile = None
    color_ref = root.get("colorProfile")
    if color_ref:
        color = resolve(objects, color_ref)
        if isinstance(color, dict):
            # Try various keys used in different Procreate versions
            icc_name_ref = color.get("SiColorProfileArchiveICCNameKey")
            if icc_name_ref is not None:
                # Might be a direct string or a reference
                resolved_name = resolve(objects, icc_name_ref)
                if isinstance(resolved_name, str):
                    color_profile = resolved_name
            if not color_profile:
                color_profile = color.get("name") or color.get("iccName")
        elif isinstance(color, str):
            color_profile = color
    meta["color_profile"] = color_profile

    # Procreate version - might be in different locations
    meta["procreate_version"] = root.get("appVersion") or root.get("version")

    # Dates (Apple absolute time → unix)
    def apple_time_to_unix(val: Optional[float]) -> Optional[int]:
        if val is None:
            return None
        return int(val + 978307200)

    # Try multiple date key names
    created = (
        root.get("creationDate") or 
        root.get("SilicaDocumentArchiveCreationDateKey") or
        root.get("documentCreationDate")
    )
    modified = (
        root.get("lastModifiedDate") or 
        root.get("SilicaDocumentArchiveModificationDateKey") or
        root.get("modificationDate")
    )
    
    meta["created_at"] = apple_time_to_unix(created)
    meta["updated_at"] = apple_time_to_unix(modified)
    
    # Fallback: use zip file timestamps if plist doesn't have them
    # Prefer QuickLook/Thumbnail.png mtime as it's updated on each save
    if zf is not None and (meta["created_at"] is None or meta["updated_at"] is None):
        import datetime
        zip_timestamp = None
        
        # Try QuickLook/Thumbnail.png first (most reliable for modification time)
        try:
            info = zf.getinfo("QuickLook/Thumbnail.png")
            dt = datetime.datetime(*info.date_time)
            zip_timestamp = int(dt.timestamp())
        except KeyError:
            pass
        
        # Fallback to Document.archive if thumbnail not found
        if zip_timestamp is None:
            try:
                info = zf.getinfo("Document.archive")
                dt = datetime.datetime(*info.date_time)
                zip_timestamp = int(dt.timestamp())
            except:
                pass
        
        if zip_timestamp is not None:
            if meta["created_at"] is None:
                meta["created_at"] = zip_timestamp
            if meta["updated_at"] is None:
                meta["updated_at"] = zip_timestamp

    # Ensure created_at is never after updated_at
    if meta["created_at"] is not None and meta["updated_at"] is not None:
        if meta["created_at"] > meta["updated_at"]:
            meta["created_at"] = meta["updated_at"]

    return meta

# -----------------------------------------------------------------------------
# Thumbnail extraction
# -----------------------------------------------------------------------------

def extract_thumbnail(zf: zipfile.ZipFile, procreate_path: Path) -> Optional[str]:
    try:
        data = zf.read("QuickLook/Thumbnail.png")
    except KeyError:
        return None

    out_path = TEMP_DIR / f"{procreate_path.stem}_{int(time.time())}.png"
    with open(out_path, "wb") as f:
        f.write(data)

    # Validate image
    Image.open(out_path).verify()

    return str(out_path)

# -----------------------------------------------------------------------------
# API commands
# -----------------------------------------------------------------------------

def inspect_procreate(path: Path):
    if not path.exists() or path.suffix.lower() != ".procreate":
        raise RuntimeError("Invalid .procreate file")

    with zipfile.ZipFile(path, "r") as zf:
        archive_data = zf.read("Document.archive")
        meta = parse_document_archive(archive_data, zf)
        thumb_path = extract_thumbnail(zf, path)

    meta["thumbnail_path"] = thumb_path
    meta["source_path"] = str(path)
    meta["file_hash"] = compute_sha256(path)

    print(json.dumps(meta, separators=(",", ":"), ensure_ascii=False))

def clear_temp(days: int):
    cutoff = time.time() - days * 86400
    removed = 0

    for file in TEMP_DIR.glob("*.png"):
        if file.stat().st_mtime < cutoff:
            file.unlink()
            removed += 1

    print(json.dumps({
        "removed": removed,
        "temp_dir": str(TEMP_DIR)
    }))


# -----------------------------------------------------------------------------
# CLIP Vector Extraction
# -----------------------------------------------------------------------------

def extract_vector(image_path: Path) -> List[float]:
    """Extract CLIP vector embedding from an image file."""
    if not image_path.exists():
        raise RuntimeError(f"Image not found: {image_path}")

    model, preprocess, device = get_clip_model()

    image = Image.open(image_path).convert("RGB")
    img_tensor = preprocess(image).unsqueeze(0).to(device)

    with torch.no_grad():
        embedding = model.encode_image(img_tensor)
        embedding = embedding / embedding.norm(dim=-1, keepdim=True)

    return embedding.squeeze().cpu().tolist()


def vector_command(path: Path):
    """CLI handler for vector extraction."""
    vector = extract_vector(path)
    print(json.dumps({
        "vector": vector,
        "source_path": str(path),
        "dimensions": len(vector)
    }, separators=(",", ":"), ensure_ascii=False))

# -----------------------------------------------------------------------------
# Entrypoint
# -----------------------------------------------------------------------------

def debug_procreate(path: Path):
    """Debug command to inspect the raw plist structure."""
    if not path.exists() or path.suffix.lower() != ".procreate":
        raise RuntimeError("Invalid .procreate file")

    with zipfile.ZipFile(path, "r") as zf:
        # Show all files in the archive
        print("=== Files in archive ===")
        for name in zf.namelist():
            info = zf.getinfo(name)
            print(f"  {name} (modified: {info.date_time})")
        print()
        
        archive_data = zf.read("Document.archive")
        plist = biplist.readPlistFromString(archive_data)

        objects = plist["$objects"]
        top = plist["$top"]
        
        print("=== $top ===")
        print(f"Type: {type(top)}")
        print(f"Keys: {top.keys() if isinstance(top, dict) else 'N/A'}")
        print(f"Content: {top}")
        print()
        
        root_ref = top.get("root")
        print(f"=== root reference ===")
        print(f"Type: {type(root_ref)}")
        print(f"Value: {root_ref}")
        print()
        
        root_uid = cfuid(root_ref)
        print(f"=== resolved root_uid ===")
        print(f"Value: {root_uid}")
        print()
        
        if root_uid is not None:
            root = objects[root_uid]
            print(f"=== root object ===")
            print(f"Type: {type(root)}")
            if isinstance(root, dict):
                print(f"Keys: {list(root.keys())}")
                print()
                
                # Highlight date-related keys
                date_keys = [k for k in root.keys() if 'date' in k.lower() or 'time' in k.lower() or 'creat' in k.lower() or 'modif' in k.lower()]
                if date_keys:
                    print("=== Date-related keys ===")
                    for key in date_keys:
                        val = root[key]
                        print(f"  {key}: {type(val).__name__} = {repr(val)}")
                    print()
                
                print("=== All root keys ===")
                for key in sorted(root.keys()):
                    val = root[key]
                    print(f"  {key}: {type(val).__name__} = {repr(val)[:100]}")
                
                # Resolve and show colorProfile
                print()
                print("=== colorProfile (resolved) ===")
                color_ref = root.get("colorProfile")
                if color_ref:
                    color_uid = cfuid(color_ref)
                    if color_uid is not None:
                        color_obj = objects[color_uid]
                        print(f"Type: {type(color_obj)}")
                        print(f"Content: {color_obj}")
                        # If it's a dict, show all keys
                        if isinstance(color_obj, dict):
                            for k, v in color_obj.items():
                                resolved_v = resolve(objects, v) if cfuid(v) is not None else v
                                print(f"  {k}: {repr(resolved_v)[:100]}")
                else:
                    print("Not found in root")
                
                # Resolve and show size
                print()
                print("=== size (resolved) ===")
                size_ref = root.get("size")
                if size_ref:
                    size_uid = cfuid(size_ref)
                    if size_uid is not None:
                        size_obj = objects[size_uid]
                        print(f"Type: {type(size_obj)}")
                        print(f"Content: {size_obj}")
                    else:
                        # It might be a direct value (like a string)
                        print(f"Direct value: {size_ref}")
                else:
                    print("Not found")
            else:
                print(f"Content: {root}")
        
        # Check if there's metadata in the zip file itself
        print()
        print("=== Checking for other metadata sources ===")
        try:
            # Some procreate files have a separate metadata plist
            if "Metadata.plist" in zf.namelist():
                meta_data = zf.read("Metadata.plist")
                meta_plist = biplist.readPlistFromString(meta_data)
                print("Found Metadata.plist:")
                print(f"  Keys: {list(meta_plist.keys()) if isinstance(meta_plist, dict) else 'N/A'}")
                for k, v in meta_plist.items():
                    print(f"  {k}: {repr(v)[:100]}")
            else:
                print("No Metadata.plist found")
        except Exception as e:
            print(f"Error reading Metadata.plist: {e}")
        
        # Show zip file modification time as fallback
        print()
        print("=== Zip file timestamps (fallback) ===")
        try:
            info = zf.getinfo("Document.archive")
            print(f"Document.archive date_time: {info.date_time}")
        except Exception as e:
            print(f"Error getting zip timestamps: {e}")


def main():
    if len(sys.argv) < 2:
        print("Usage: procreate_meta.py <command> [args]")
        print("Commands:")
        print("  inspect <file.procreate>  - Extract metadata from a .procreate file")
        print("  debug <file.procreate>    - Debug: show raw plist structure")
        print("  vector <image.png>        - Extract CLIP vector embedding from an image")
        print("  clear-temp [days]         - Clean up temp files older than N days (default: 7)")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == "inspect":
        if len(sys.argv) < 3:
            print("Error: inspect requires a file path")
            sys.exit(1)
        inspect_procreate(Path(sys.argv[2]))
    elif cmd == "debug":
        if len(sys.argv) < 3:
            print("Error: debug requires a file path")
            sys.exit(1)
        debug_procreate(Path(sys.argv[2]))
    elif cmd == "vector":
        if len(sys.argv) < 3:
            print("Error: vector requires an image path")
            sys.exit(1)
        vector_command(Path(sys.argv[2]))
    elif cmd == "clear-temp":
        days = int(sys.argv[2]) if len(sys.argv) > 2 else 7
        clear_temp(days)
    else:
        raise RuntimeError(f"Unknown command: {cmd}")

if __name__ == "__main__":
    main()
