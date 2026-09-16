"""Assemble the public site without original PNGs, recordings or local tools."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parent.parent
output = root / '_site'
output.mkdir(exist_ok=True)
for name in ('index.html', 'mascot.js', 'sprite-alignment.js', 'upload.js'):
    shutil.copy2(root / name, output / name)
for folder in ('characters', 'legacy'):
    shutil.copytree(root / 'assets' / folder, output / 'assets' / folder, dirs_exist_ok=True)
shutil.copytree(root / 'skills', output / 'skills', dirs_exist_ok=True)
(output / '.nojekyll').touch()
print(f'Static site ready: {output}')
