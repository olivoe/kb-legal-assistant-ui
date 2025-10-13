# 📚 Safe Document Addition Guide

This guide explains how to safely add new documents to the Knowledge Base without breaking the pipeline.

## 🚀 Quick Start

### 1. Add Your Documents

Place new documents in the appropriate folder under:
```
public/kb-text/kb-legal-documents/
```

Example:
```
public/kb-text/kb-legal-documents/
  ├── articulos/
  ├── Materiales Extranjeria/
  └── Sobre Olivo Galarza Abogados/  ← New folder
      └── informacion general.pdf     ← New document
```

### 2. Test with Dry Run (Safe - No Changes)

```bash
node scripts/safe-add-documents.js --path "Sobre Olivo Galarza Abogados" --dry-run
```

This shows what **would** happen without making any changes.

### 3. Run the Pipeline

```bash
node scripts/safe-add-documents.js --path "Sobre Olivo Galarza Abogados"
```

The script will:
- ✅ Validate documents
- ✅ Extract PDF text (if needed)
- ✅ Commit to GitHub
- ✅ Rebuild KB with embeddings
- ✅ Verify results

---

## 📖 Detailed Usage

### Command Options

```bash
node scripts/safe-add-documents.js [options]
```

**Required:**
- `--path "path/to/docs"` - Path relative to `kb-legal-documents/`

**Optional:**
- `--dry-run` - Test without making changes (recommended first)
- `--skip-github` - Skip GitHub push (for testing)
- `--skip-rebuild` - Skip KB rebuild (do it manually later)
- `--force` - Skip confirmations (for automation)

### Examples

**Test a single file:**
```bash
node scripts/safe-add-documents.js \
  --path "articulos/new-document.pdf" \
  --dry-run
```

**Add a folder with multiple documents:**
```bash
node scripts/safe-add-documents.js \
  --path "Materiales Extranjeria/Nuevas Hojas"
```

**Add without rebuilding KB (faster, rebuild later):**
```bash
node scripts/safe-add-documents.js \
  --path "articulos/document.pdf" \
  --skip-rebuild
```

Then rebuild manually when ready:
```bash
node scripts/build-kb-from-github.js
```

---

## 🛡️ What Makes This Safe?

### 1. **Validation First**
- Checks if files exist
- Identifies PDFs that need text extraction
- Reports what will be processed

### 2. **Dry Run Mode**
- Test the entire pipeline without making changes
- See exactly what would happen
- Catch issues before they occur

### 3. **Step-by-Step with Confirmations**
- Each major step requires confirmation
- You can abort at any time (Ctrl+C)
- No partial commits

### 4. **Clear Error Messages**
- If something fails, you'll know exactly what went wrong
- Pipeline stops safely without corrupting data
- Easy to fix and retry

### 5. **Verification**
- Checks that embeddings were generated
- Verifies KB index is updated
- Confirms document counts

---

## 🔍 Troubleshooting

### PDF Text Extraction Fails

**Problem:** `generate-pdf-sidecars.js` can't extract text from PDF

**Solution:**
1. Manually create `.txt` file with same name as PDF
2. Copy text content into it
3. Run pipeline again

### Git Conflicts

**Problem:** Submodule has conflicts or uncommitted changes

**Solution:**
```bash
cd kb-legal-documents
git status
git stash  # or commit/reset as needed
cd ..
```

### Embedding Generation Fails

**Problem:** KB rebuild times out or fails

**Solution:**
1. Check `OPENAI_API_KEY` is set
2. Try smaller batches:
   ```bash
   node scripts/safe-add-documents.js --path "folder" --skip-rebuild
   # Then rebuild manually:
   node scripts/build-kb-from-github.js
   ```

### Wrong Document Count

**Problem:** Embeddings count doesn't increase as expected

**Solution:**
1. Check if document is a duplicate
2. Verify file naming (no special characters)
3. Check file wasn't already in KB

---

## 🎯 Best Practices

### Before Adding Documents:

1. **Always test with `--dry-run` first**
   ```bash
   node scripts/safe-add-documents.js --path "new-docs" --dry-run
   ```

2. **Check the current state**
   ```bash
   # Check current document count
   cat data/kb/kb_index.json | jq 'length'
   
   # Check current embedding count
   cat data/kb/embeddings.json | jq '.items | length'
   ```

3. **Ensure files are properly named**
   - Use descriptive names
   - Avoid special characters
   - Use lowercase with spaces or hyphens

### During the Process:

1. **Watch for warnings**
   - Yellow warnings are informational
   - Address any red errors immediately

2. **Verify each step**
   - Read the confirmation prompts
   - Check the output looks correct

3. **Don't interrupt during commits**
   - If you need to stop, do it before or after git operations
   - Ctrl+C is safe during validation/extraction

### After Adding Documents:

1. **Verify on the website**
   - Visit https://ai.olivogalarza.com/kb
   - Check new documents appear
   - Verify embedding count increased

2. **Test the AI Chat**
   - Ask questions about new documents
   - Verify answers use the new content

3. **Check the admin logs**
   - Visit https://ai.olivogalarza.com/admin
   - Monitor for any errors

---

## 📊 Expected Results

### For 1 New PDF (e.g., 10 pages):

- **Sidecars:** +1 TXT file
- **KB Documents:** +2 files (PDF + TXT)
- **Embeddings:** +20 to +50 (depending on content)
- **Time:** 2-5 minutes total

### For a Folder (e.g., 10 PDFs):

- **Sidecars:** +10 TXT files
- **KB Documents:** +20 files
- **Embeddings:** +200 to +500
- **Time:** 5-15 minutes total

---

## ⚡ Quick Reference Card

```bash
# 1. Test first (always!)
node scripts/safe-add-documents.js --path "folder-name" --dry-run

# 2. Run for real
node scripts/safe-add-documents.js --path "folder-name"

# 3. Verify results
cat data/kb/kb_index.json | jq 'length'
cat data/kb/embeddings.json | jq '.items | length'

# 4. Check website
open https://ai.olivogalarza.com/kb
```

---

## 🆘 Need Help?

If you encounter issues:

1. **Check this guide** - Common issues are documented above
2. **Run with `--dry-run`** - See what the pipeline would do
3. **Check logs** - Look for error messages in terminal output
4. **Manual fallback** - You can always do steps manually:
   ```bash
   # 1. Generate sidecars
   node scripts/generate-pdf-sidecars.js
   
   # 2. Commit to submodule
   cd kb-legal-documents
   git add .
   git commit -m "Add new documents"
   git push origin main
   cd ..
   
   # 3. Update main repo
   git add public/kb-text/kb-legal-documents
   git commit -m "Update submodule"
   git push origin main
   
   # 4. Rebuild KB
   node scripts/build-kb-from-github.js
   ```

---

**Remember: When in doubt, use `--dry-run` first!** 🛡️

