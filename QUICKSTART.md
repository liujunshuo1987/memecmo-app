# Multi-Model LLM Analysis - Quick Start Guide

## Setup (5 minutes)

### 1. Install Dependencies
```bash
cd /Users/sx/Downloads/09_GEO企业出海/guanlan
npm install --legacy-peer-deps
```

### 2. Configure API Keys

Edit `.env.local` and add your API keys:

```bash
# Get Poe API Key (https://poe.com/api)
POE_API_KEY=your_poe_api_key_here

# Get Anthropic API Key (https://console.anthropic.com/account/keys)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Create a random secret for internal API calls
INTERNAL_API_SECRET=your_random_secret_here
```

### 3. Start Development Server
```bash
npm run dev
```

Server will run on `http://localhost:3001`

### 4. Access the Multi-Model Analysis
1. Open `http://localhost:3001/sov-dashboard`
2. Click on "Multi-Model Analysis" tab
3. Start analyzing!

## Basic Usage (10 minutes)

### Step 1: Enter Brand Name
In the "Brand Name" field, enter the company or product you want to analyze:
- Example: "OpenAI"
- Example: "Figma"
- Example: "Your Company Name"

### Step 2: Configure Questions
Enter questions (one per line) to ask all LLMs:

```
What is [BRAND_NAME]?
What are the key features of [BRAND_NAME]?
Who uses [BRAND_NAME]?
What are the main advantages of [BRAND_NAME]?
```

**Note:** Use `[BRAND_NAME]` as a placeholder - it will be auto-replaced.

### Step 3: Select LLM Models
Choose which models to query:
- ✓ GPT-4 (Most comprehensive, higher cost)
- ✓ Claude Opus (Best reasoning, good balance)
- ✓ Gemini Pro (Fast, cost-effective)
- Perplexity (Good for research)
- DeepSeek (Very affordable)

**Recommendation:** Start with GPT-4, Claude Opus, and Gemini Pro

### Step 4: Execute Analysis
Click "Execute Analysis" button

The system will:
1. Query all selected models in parallel (30-60 seconds)
2. Analyze responses for consensus and divergence
3. Generate GEO-specific recommendations using Claude
4. Display results in real-time

## Understanding Results

### 1. Sentiment Analysis
Shows how positive/negative the LLMs are about your brand:
- **Positive (%)** - Mentions positive attributes
- **Neutral (%)** - Objective/factual mentions
- **Negative (%)** - Mentions negative attributes

### 2. Consensus Score
**Overall Consensus (0-100%)**
- 0-33%: Models have very different views
- 34-66%: Models agree on some aspects
- 67-100%: Models align on most aspects

**Brand Perception Consensus**
- How much models agree on your brand's positioning

**Knowledge Gaps**
- Information that models lack about your brand:
  - Missing pricing info
  - Partnership details
  - Security/compliance info
  - Integration options

### 3. GEO Insights
Strategic recommendations based on how LLMs perceive your brand.

**Executive Summary**
- Overview of your brand's AI visibility

**GEO Strategy**
- Overall optimization approach
- Priority level (Critical/High/Medium)
- Expected mention lift (%)

**Model-Specific Recommendations**
For each model (GPT-4, Claude, etc.):
- Current mention rate (%)
- Target mention rate (%)
- Specific optimizations:
  - **Focus Areas** - Topics the model understands better
  - **Language Preferences** - How to phrase information
  - **Structuring Tips** - How to organize information
- **Quick Wins** - Easy changes with measurable impact

## Common Use Cases

### Use Case 1: Competitive Analysis
**Goal:** Understand how LLMs position your brand vs competitors

**Setup:**
1. Brand name: "Your Company"
2. Questions:
   - "What is [BRAND_NAME]?"
   - "How does [BRAND_NAME] compare to Competitor X?"
   - "What are [BRAND_NAME]'s advantages?"
   - "Who should use [BRAND_NAME]?"

**Insights:**
- How models differentiate you from competitors
- What messaging resonates
- Where perception gaps exist

### Use Case 2: Content Strategy
**Goal:** Identify what content types LLMs prefer

**Setup:**
1. Brand name: "Your Company"
2. Questions:
   - "What are the key features of [BRAND_NAME]?"
   - "Can you give me examples of [BRAND_NAME] being used?"
   - "What problems does [BRAND_NAME] solve?"
   - "Who has praised [BRAND_NAME]?"

**Insights:**
- Whether data/statistics work better
- Whether case studies are more effective
- What proof points matter most

### Use Case 3: Perception Gap Repair
**Goal:** Fix misunderstandings in how LLMs represent you

**Setup:**
1. Brand name: "Your Company"
2. Questions about specific perception gaps
3. Questions testing corrections

**Insights:**
- Specific content changes needed
- Timeline to fix misconceptions (4-8 weeks)
- Which sources/signals matter for each model

## Cost Estimates

**Per Query (10 questions, 3 models):**
- GPT-4 only: $1-2
- Claude Opus only: $0.75-1.50
- Gemini Pro only: $0.25-0.50
- All three: $2-4

**Budget Management:**
- Limit questions to 10-20 per query
- Reuse same questions (caching saves 100%)
- Use cheaper models for initial exploration
- Use premium models for final validation

## Optimization Tips

### 1. Question Design
**Good:**
- "What is the primary use case for [BRAND_NAME]?"
- "What industry does [BRAND_NAME] serve?"
- "What are the technical capabilities of [BRAND_NAME]?"

**Avoid:**
- Overly long questions (keep <20 words)
- Multiple questions in one (ask one thing per line)
- Yes/no questions (ask "What..." instead)

### 2. Iterative Analysis
1. **First Pass:** 3-5 basic questions, all models
2. **Second Pass:** Dive deep on key areas
3. **Third Pass:** Test perception corrections
4. **Repeat:** Monthly to track improvements

### 3. Taking Action
Based on GEO insights, you might:
- Update website content structure
- Create new content addressing knowledge gaps
- Optimize existing content for LLM visibility
- Develop content for high-value use cases
- Get third-party validations/awards

## Troubleshooting

### "Unauthorized" Error
**Cause:** Not logged in
**Fix:** Log in first using Google/Facebook or email

### Query Stuck on "Processing"
**Cause:** API timeout or connectivity issue
**Fix:** 
1. Check your internet connection
2. Verify API keys are valid
3. Try again with fewer questions
4. Check browser console (F12) for errors

### No GEO Insights
**Cause:** Claude API not responding
**Fix:**
1. Verify ANTHROPIC_API_KEY in .env.local
2. Check API key has credits
3. Try again in a few seconds
4. Check rate limits haven't been exceeded

### High Costs
**Cause:** Querying too many models or questions
**Fix:**
1. Use "Speed" priority (shorter timeout, saves cost)
2. Reduce number of questions
3. Use cheaper models (Gemini, DeepSeek)
4. Leverage caching (same queries return instantly)

## Next Steps

1. **Analyze Your Brand**
   - Run first analysis on your main brand
   - Review sentiment and consensus scores
   - Note key insights

2. **Take Action**
   - Implement top GEO recommendations
   - Update website content
   - Create new supporting content

3. **Measure Impact**
   - Re-run analysis in 2-4 weeks
   - Compare mention rates and sentiment
   - Track improvements

4. **Iterate**
   - Use insights to refine content
   - Test new messaging
   - Validate improvements with follow-up queries

## Advanced Features

### Caching
Identical queries return cached results within 2 seconds:
- Same question set
- Same models
- Same brand name
- Cache valid for 7 days

### Background Processing
Analysis runs asynchronously:
1. Query submitted → Returns immediately
2. You get queryId for polling
3. Results built in background
4. Automatic polling in UI shows progress

### Export and Reports
(Coming soon)
- PDF reports
- CSV exports
- Shareable links
- Template saving

## Support

**Documentation:**
- Full docs: `/Users/sx/Downloads/09_GEO企业出海/guanlan/MULTI_MODEL_ANALYSIS.md`
- Architecture: See system diagrams in docs

**Debugging:**
```bash
# View live server logs
tail -f /tmp/next_dev.log

# Check API responses
curl -X GET http://localhost:3001/api/multi-model-query/[queryId]

# Database queries
# Access: https://[your-supabase-url]/storage/browser
```

**Common Questions:**

Q: How long does analysis take?
A: Usually 45-85 seconds, sometimes faster with caching

Q: How much does it cost?
A: $2-4 per full analysis (10 questions, 3 models)

Q: What's the difference between models?
A: See detailed comparison in MULTI_MODEL_ANALYSIS.md

Q: Can I ask proprietary questions?
A: Yes, all data is encrypted and isolated to your account via RLS

Q: Is it accurate?
A: Consensus >70% means high confidence. Lower consensus = divergent views

## Examples

### Example Output
```
Sentiment: 65% Positive, 25% Neutral, 10% Negative
Overall Consensus: 78%
Brand Perception Consensus: 82%

Knowledge Gaps:
- Information about pricing is missing
- Integration capabilities not mentioned
- Company size/funding not highlighted

GEO Strategy:
- Add pricing information to key pages
- Create integration documentation
- Highlight company credibility signals
- Expected lift: 25% increase in mention rate
```

## Success Metrics

**Good Results:**
- Consensus >70% (models agree)
- Positive sentiment >50%
- <3 major knowledge gaps
- Clear recommendations identified

**Action-Ready:**
- Specific model-by-model recommendations
- Quantified expected improvements
- Clear priority order
- Implementable within 2-4 weeks

## Getting Help

1. Check logs: `/tmp/next_dev.log`
2. Review docs: `MULTI_MODEL_ANALYSIS.md`
3. Test endpoints with curl
4. Verify API keys and permissions
5. Check Supabase database directly

## What's Next?

After implementing Phase 2 (Data Processing Engine):
- Phase 3: GEO Insight Generation (Claude-based)
- Phase 4: Advanced UI Components
- Phase 5: Testing & Optimization

See the full plan: `/Users/sx/.claude/plans/kind-roaming-codd.md`
