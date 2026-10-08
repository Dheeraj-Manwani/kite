"""Read-only QA of synthetic packaged probe outputs; requires pypdf, Pillow and Poppler."""
import argparse
import json
import io
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageChops
from pypdf import PdfReader

parser = argparse.ArgumentParser()
parser.add_argument('--directory', default='out/background-documents')
parser.add_argument('--pdftoppm', default='pdftoppm')
args = parser.parse_args()
root = Path(args.directory)
parsed = []
for filename in sorted(root.glob('*.pdf')):
    reader = PdfReader(filename, strict=True)
    assert not reader.is_encrypted and len(reader.pages) > 0
    parsed.append({'name': filename.name, 'pages': len(reader.pages)})
source, optimized = PdfReader(root / 'source.pdf'), PdfReader(root / 'optimized.pdf')
assert len(source.pages) == len(optimized.pages) == 15
for before, after in zip(source.pages, optimized.pages):
    assert tuple(before.mediabox) == tuple(after.mediabox)
    assert before.extract_text() == after.extract_text()
differences = []
with tempfile.TemporaryDirectory(prefix='kite-pdf-fidelity-') as directory:
    temp = Path(directory)
    for name in ['source', 'optimized']:
        subprocess.run([args.pdftoppm, '-r', '100', '-png', str(root / f'{name}.pdf'), str(temp / name)], check=True, capture_output=True)
    before = sorted(temp.glob('source-*.png'))
    after = sorted(temp.glob('optimized-*.png'))
    assert len(before) == len(after) == 15
    for a, b in zip(before, after):
        original, output = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
        assert original.size == output.size
        diff = ImageChops.difference(original, output)
        changed = sum(pixel != (0, 0, 0) for pixel in diff.get_flattened_data())
        assert changed == 0, f'Render changed: {a.name}'
        differences.append({'page': int(a.stem.rsplit('-', 1)[1]), 'changedPixels': changed})
    # Every other supported output must render, not only parse.
    for item in parsed:
        if item['name'] in ['source.pdf', 'optimized.pdf']:
            continue
        subprocess.run([args.pdftoppm, '-r', '72', '-png', str(root / item['name']), str(temp / item['name'])], check=True, capture_output=True)
        assert len(list(temp.glob(item['name'] + '-*.png'))) == item['pages']
images = []
fixtures = Path('assets/document-fixtures')
for name in ['rgb.png', 'rgba.png', 'rgb.jpg']:
    reader = PdfReader(root / f'{name}.pdf')
    embedded = list(reader.pages[0].images)
    assert len(embedded) == 1
    original = Image.open(fixtures / name).convert('RGBA')
    # pypdf's convenience JPEG export re-encodes it; compare the actual embedded DCT stream.
    if name.endswith('jpg'):
        streams = [obj.get_object() for obj in reader.pages[0]['/Resources']['/XObject'].values()]
        jpeg = next(obj.get_data() for obj in streams if obj.get('/Filter') == '/DCTDecode')
        assert jpeg == (fixtures / name).read_bytes()
        extracted = Image.open(io.BytesIO(jpeg)).convert('RGBA')
    else:
        extracted = embedded[0].image.convert('RGBA')
    assert original.size == extracted.size
    assert original.tobytes() == extracted.tobytes(), f'Image pixels changed: {name}'
    images.append({'name': name, 'decodedPixelsAndAlphaIdentical': True, 'jpegStreamBytesIdentical': name.endswith('jpg'), 'width': original.width, 'height': original.height})
assert 'café' in ''.join(page.extract_text() for page in PdfReader(root / 'text.txt.pdf').pages)
assert '<script>fetch("https://example.com")</script>' in ''.join(page.extract_text() for page in PdfReader(root / 'source.md.pdf').pages)
report = {'renderer': 'Poppler pdftoppm at 100 DPI for optimization comparisons, 72 DPI for conversion render checks', 'parser': 'pypdf strict', 'parsed': parsed, 'optimization': {'pageCount': 15, 'pageBoxesAndTextIdentical': True, 'renderDifferences': differences}, 'images': images, 'text': {'latinUtf8Preserved': True, 'markdownScriptLiteral': True}, 'scope': 'Synthetic supported fixtures only; no Office or general PDF compatibility claim.'}
(root / 'fidelity.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
