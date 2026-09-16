"""Rebuild served WebP atlases; keep PNG source files."""
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parent.parent
before = after = 0
# PNG originals live in assets/originals/; the WebP they rebuild is served from
# assets/characters/ (named characters) or assets/legacy/ (early astronaut art).
for source in sorted((root / "assets" / "originals").glob("*.png")):
    served = "characters" if "-" in source.stem else "legacy"
    target = root / "assets" / served / (source.stem + ".webp")
    subprocess.run(["cwebp", "-quiet", "-q", "85", "-alpha_q", "100", "-m", "6", str(source), "-o", str(target)], check=True)
    before += source.stat().st_size
    after += target.stat().st_size
    print(f"{source.name}: {source.stat().st_size:,} -> {target.stat().st_size:,} bytes")
print(f"Total: {before:,} -> {after:,} bytes ({1-after/before:.1%} smaller)")
