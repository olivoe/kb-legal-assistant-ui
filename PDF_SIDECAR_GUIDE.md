# PDF Sidecar Generation Guide

## Overview

The KB system now supports `.txt` sidecar files for PDFs, which provide:
- **Better text quality**: Pre-extracted text is more accurate than runtime extraction
- **Faster processing**: No need to extract text during KB builds
- **Multi-method extraction**: Fallback to multiple extraction methods if sidecar is missing

## How It Works

### Priority Order
1. **`.txt` sidecar** (if exists) - highest quality, fastest
2. **pdfjs-dist** - fast JavaScript extraction
3. **pdftotext** (poppler) - better layout preservation
4. **OCR** (ghostscript + tesseract) - for scanned PDFs

### File Structure
```
kb-legal-documents/
├── document.pdf          # Original PDF
├── document.txt          # Sidecar (same name, .txt extension)
├── subfolder/
│   ├── another.pdf
│   └── another.txt       # Sidecars work in subdirectories too
```

## Installation

### Install PDF extraction tools (optional but recommended)

```bash
# On macOS (ARM)
arch -arm64 brew install poppler ghostscript tesseract

# Or use npm script
npm run install-pdf-tools
```

### Check available methods

```bash
npm run kb:sidecars:check
```

Output:
```
Available methods:
  - pdfjs (JS): ✅
  - pdftotext (poppler): ✅
  - OCR (gs + tesseract): ✅
```

## Usage

### Generate sidecars for all PDFs

This will:
1. Fetch all PDFs from `olivoe/kb-legal-documents`
2. Check which ones already have `.txt` sidecars
3. Extract text using multi-method approach
4. Save `.txt` files locally

```bash
npm run kb:sidecars
```

Output directory: `tmp/kb-sidecars/`

### Test with a few PDFs first

```bash
npm run kb:sidecars:test
```

This processes only 5 PDFs for testing.

### Upload sidecars to GitHub

After generating sidecars locally:

```bash
# Copy to your local kb-legal-documents repo
rsync -av tmp/kb-sidecars/ /path/to/kb-legal-documents/

# Review the files
cd /path/to/kb-legal-documents
git status

# Commit and push
git add *.txt
git commit -m "Add .txt sidecars for PDFs"
git push origin main
```

This will trigger the webhook and rebuild the KB automatically.

## KB Build Behavior

### With Sidecars
```
📡 Fetching documents from GitHub...
✅ Found 330 documents
📄 Extracting text content...
  📄 Using sidecar: document.txt
✅ Extracted text from: document.pdf
```

### Without Sidecars (Fallback)
```
📡 Fetching documents from GitHub...
✅ Found 330 documents
📄 Extracting text content...
  🔧 Extracting from PDF: document.pdf
✅ Extracted 5432 chars from document.pdf using pdfjs
```

## Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run kb:sidecars` | Generate all missing sidecars |
| `npm run kb:sidecars:test` | Test with 5 PDFs |
| `npm run kb:sidecars:check` | Check available extraction methods |
| `npm run build-kb` | Build KB (uses sidecars if available) |
| `npm run kb:check` | Verify 100% embedding coverage |

## Troubleshooting

### "pdftotext not installed"

```bash
arch -arm64 brew install poppler
```

### "OCR tools not installed"

```bash
arch -arm64 brew install ghostscript tesseract
```

### "Extracted text too short"

Some PDFs are scanned images without text layer. Solutions:
1. Install OCR tools (ghostscript + tesseract)
2. Manually create `.txt` sidecar with correct content
3. Re-scan the PDF with OCR enabled

### "All methods failed"

The PDF may be corrupted or encrypted. Options:
1. Try opening in Preview/Acrobat and re-saving
2. Use `gs` to repair: `gs -o fixed.pdf -sDEVICE=pdfwrite broken.pdf`
3. Manually create `.txt` sidecar

## Best Practices

1. **Generate sidecars for all PDFs** - This ensures consistent, high-quality text extraction
2. **Review extracted text** - Check a few samples to ensure quality
3. **Update sidecars when PDFs change** - Re-run the generator after updating PDFs
4. **Commit sidecars with PDFs** - Keep them together in version control

## Example Workflow

```bash
# 1. Check available methods
npm run kb:sidecars:check

# 2. Test with a few PDFs
npm run kb:sidecars:test

# 3. Review output
ls -lh tmp/kb-sidecars/

# 4. Generate all sidecars
npm run kb:sidecars

# 5. Copy to KB repo
rsync -av tmp/kb-sidecars/ ~/kb-legal-documents/

# 6. Commit and push
cd ~/kb-legal-documents
git add .
git commit -m "Add .txt sidecars for all PDFs"
git push origin main

# 7. Webhook triggers KB rebuild automatically
# 8. Verify at https://github.com/olivoe/kb-legal-assistant-ui/actions
```

## Technical Details

### PDFExtractor Class

Located in `scripts/pdf-extractor.js`, provides:

```javascript
const { PDFExtractor } = require('./pdf-extractor');

const extractor = new PDFExtractor({
  preferSidecars: true,  // Try .txt sidecar first
  verbose: true          // Log extraction details
});

const result = await extractor.extract(pdfBuffer, pdfPath);
// result = { text: "...", method: "sidecar|pdfjs|pdftotext|ocr" }
```

### Integration with KB Build

The `build-kb-from-github.js` script automatically:
1. Fetches all files from GitHub (including `.txt` sidecars)
2. For each PDF, checks if sidecar exists
3. Uses sidecar if available, otherwise extracts from PDF
4. Logs which method was used for each document

### Performance

| Method | Speed | Quality | Requirements |
|--------|-------|---------|--------------|
| Sidecar | ⚡⚡⚡ Instant | ⭐⭐⭐⭐⭐ Best | Pre-generated |
| pdfjs | ⚡⚡⚡ Fast | ⭐⭐⭐ Good | None |
| pdftotext | ⚡⚡ Medium | ⭐⭐⭐⭐ Better | poppler |
| OCR | ⚡ Slow | ⭐⭐ Variable | gs + tesseract |

## Monitoring

The KB build logs show which method was used:

```bash
# View latest build logs
gh run list --workflow=kb-build.yml --limit 1
gh run view <RUN_ID> --log | grep "Using sidecar\|Extracting from PDF"
```

Count sidecars vs. direct extraction:

```bash
gh run view <RUN_ID> --log | grep -c "Using sidecar"
gh run view <RUN_ID> --log | grep -c "Extracting from PDF"
```
