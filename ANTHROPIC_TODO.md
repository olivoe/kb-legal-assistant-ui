# Anthropic Integration - TODO for Tomorrow

## Current Status
✅ **Reverted to working version** (commit `37671f2`)  
✅ Site is live and working with **OpenAI GPT-4** at https://ai.olivogalarza.com/  
❌ Anthropic integration attempted but failed with 404 errors  

---

## Issues Encountered

### 1. Model ID Problems
Both Claude 3.5 Sonnet model identifiers returned **404 Not Found**:
- ❌ `claude-3-5-sonnet-20240620` 
- ❌ `claude-3-5-sonnet-20241022`

**Error from logs:**
```json
{
  "status": 404,
  "error": {
    "type": "not_found_error",
    "message": "model: claude-3-5-sonnet-20241022"
  }
}
```

### 2. Route 404 Error
After several deployments, the `/api/rag/stream` endpoint itself returned 404, suggesting:
- Build failure on Vercel
- Runtime error preventing route from loading
- Missing environment variable causing crash

---

## Root Cause Investigation Needed

### Hypothesis 1: API Key Tier Limitation
**Most Likely**: Your Anthropic API key might not have access to Claude 3.5 models.

**Check:**
1. Visit https://console.anthropic.com/
2. Go to Settings → API Keys
3. Check your account tier/plan
4. Verify which models you have access to
5. Look for any access restrictions or warnings

**Possible solutions:**
- Upgrade Anthropic account tier
- Request access to Claude 3.5 Sonnet
- Use Claude 3 Opus instead (better than 3 Sonnet, costs more)

### Hypothesis 2: Incorrect Model Identifier Format
**Possible**: The model naming convention might be different.

**To verify:**
- Check Anthropic documentation for exact model names
- Try API playground in Anthropic console to see working model IDs
- Contact Anthropic support for correct Claude 3.5 identifier

### Hypothesis 3: Missing OpenAI Key in Vercel
**Simple fix**: Embeddings still require OpenAI.

**Check in Vercel:**
- Settings → Environment Variables → Production
- Verify **both** keys are present:
  - `OPENAI_API_KEY` (for embeddings)
  - `ANTHROPIC_API_KEY` (for chat)

---

## Tomorrow's Action Plan

### Step 1: Verify Anthropic Account (5 min)
1. Login to https://console.anthropic.com/
2. Check available models
3. Check account tier/billing
4. Note the exact model IDs shown in their interface

### Step 2: Test Direct API Call (10 min)
Before modifying code, test the Anthropic API directly:

```bash
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-3-sonnet-20240229",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello, Claude!"}
    ]
  }'
```

If this works, try `claude-3-5-sonnet-20241022` to see the exact error.

### Step 3: Use Working Model (15 min)
If Claude 3.5 is unavailable, decide on fallback:

**Option A**: Use Claude 3 Opus (best quality, higher cost)
```typescript
const ANTHROPIC_MODEL = "claude-3-opus-20240229";
```

**Option B**: Use Claude 3 Sonnet (good quality, same cost as 3.5)
```typescript
const ANTHROPIC_MODEL = "claude-3-sonnet-20240229";
```

**Option C**: Keep OpenAI GPT-4 (current, working)
```typescript
// No change needed, already working
```

### Step 4: Check Vercel Build Logs (5 min)
Before deploying again:
1. Ensure both API keys are in Vercel
2. Deploy
3. Check Build Logs immediately for errors
4. Check Function Logs for runtime errors

### Step 5: Incremental Testing (20 min)
1. Deploy code changes
2. Check Vercel logs immediately
3. Test one question on live site
4. Verify response appears
5. If blank, check logs for 404/400/500 errors
6. Fix and repeat

---

## Files Modified During Migration

**Created:**
- `lib/llm/anthropic.ts` - Claude API client
- `ANTHROPIC_MIGRATION.md` - Migration documentation
- `scripts/test-claude.js` - Test script

**Modified:**
- `app/api/rag/stream/route.ts` - Streaming endpoint
- `app/api/rag/answer/route.ts` - Non-streaming endpoint
- `env.template` - Added ANTHROPIC_API_KEY

**Note:** These changes are in git history but reverted. Can be recovered with:
```bash
git show b3eb509:path/to/file
```

---

## Success Criteria

✅ No 404 errors from Claude API  
✅ Responses stream properly to frontend  
✅ Quality is equal or better than GPT-4  
✅ Cost is ~70% lower than current setup  
✅ No regression in existing features  

---

## Fallback Plan

If Claude integration continues to fail:
1. **Keep OpenAI** - It's working perfectly
2. **Focus on quality improvements** instead:
   - Better prompt engineering
   - Improved retrieval logic
   - Enhanced context selection
   - More comprehensive testing

The migration to Claude is an **optimization**, not a necessity. Current GPT-4 setup is solid.

---

## Resources

- Anthropic API Docs: https://docs.anthropic.com/
- Anthropic Console: https://console.anthropic.com/
- Model List: https://docs.anthropic.com/en/docs/models-overview
- Support: https://support.anthropic.com/

---

**Created:** November 4, 2025  
**Last Working Commit:** `37671f2`  
**Reverted From:** `4c864be`

