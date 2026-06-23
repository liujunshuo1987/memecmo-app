# Multi-Model LLM Analysis Engine

## Overview

The Multi-Model LLM Analysis Engine enables brands to understand how different LLMs (Large Language Models) perceive and represent them. By querying multiple models simultaneously with the same question set, the system:

1. **Measures Consensus** - Identifies what all models agree on regarding your brand
2. **Detects Divergence** - Highlights where different models have different perceptions
3. **Generates GEO Insights** - Provides actionable strategies for optimizing brand visibility in AI systems (Generative Engine Optimization)

## System Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Interface (React)                        │
│         components/sov-dashboard/multi-model-analyzer.tsx       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              API Routes (Next.js)                                │
│  /api/multi-model-query                                         │
│  /api/aggregate-responses                                       │
│  /api/generate-geo-insights                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ↓                  ↓                  ↓
    ┌───────────────┐ ┌──────────────┐ ┌──────────────────┐
    │ Poe Client    │ │LLM Aggregator│ │GEO Insight Gen.  │
    │(lib/poe-....) │ │(lib/llm-....) │ │(lib/geo-insight) │
    └───────────────┘ └──────────────┘ └──────────────────┘
           │                  │                  │
           ↓                  ↓                  ↓
    ┌──────────────────────────────────────────────────────┐
    │          Supabase PostgreSQL Database                │
    │                                                      │
    │  - multi_model_queries_v2 (user queries & results)  │
    │  - query_aggregations (consensus analysis)          │
    │  - generated_insights (GEO recommendations)         │
    │  - geo_analysis_cache (7-day TTL cache)            │
    └──────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Query Execution

```
User Input
  ↓
POST /api/multi-model-query
  ├─ Validate input (questions, models, brand name)
  ├─ Check cache for existing results
  ├─ Create query record in database
  ├─ Execute PoeClient.parallelQuery() (background)
  └─ Return queryId for polling
```

### 2. Aggregation Analysis

```
Raw Model Responses
  ↓
POST /api/aggregate-responses (automatic)
  ├─ Calculate semantic similarity between models
  ├─ Measure consensus strength (0-100%)
  ├─ Extract brand positioning per model
  ├─ Identify divergent viewpoints
  ├─ Calculate citation likelihood
  ├─ Identify knowledge gaps
  └─ Save results to database
```

### 3. GEO Insight Generation

```
Aggregation Results
  ↓
POST /api/generate-geo-insights (automatic)
  ├─ Use Claude to analyze results
  ├─ Generate executive summary
  ├─ Create model-specific recommendations
  ├─ Develop content strategies
  ├─ Identify cognitive gaps and repair strategies
  ├─ Cache results for future queries
  └─ Update query status to "completed"
```

## API Endpoints

### POST `/api/multi-model-query`

Execute a multi-model LLM query.

**Request:**
```json
{
  "questionSet": ["What is [BRAND_NAME]?", "..."],
  "brandName": "Your Brand",
  "competitorNames": ["Competitor1", "Competitor2"],
  "models": ["gpt-4", "claude-opus", "gemini-pro"],
  "priority": "quality",
  "region": "Southeast Asia",
  "language": "en"
}
```

**Response:**
```json
{
  "queryId": "uuid-here",
  "status": "processing",
  "costEstimate": {
    "totalCostCents": 150,
    "costBreakdown": {
      "gpt-4": 50,
      "claude-opus": 50,
      "gemini-pro": 50
    }
  }
}
```

### GET `/api/multi-model-query/[queryId]`

Poll for query status and results.

**Response:**
```json
{
  "queryId": "uuid-here",
  "status": "completed",
  "progress": {
    "stage": "Complete",
    "percentage": 100
  },
  "results": {
    "modelResponses": {...},
    "aggregationResult": {...},
    "geoInsights": {...}
  }
}
```

### POST `/api/aggregate-responses`

(Automatic - called by multi-model-query after responses arrive)

Aggregates responses from multiple models and calculates consensus metrics.

### POST `/api/generate-geo-insights`

(Automatic - called by aggregate-responses)

Uses Claude to generate GEO-specific insights and recommendations.

## Data Structures

### AggregationResult

```typescript
{
  consensusAnalysis: {
    overallConsensus: 0-100,           // All models agreement level
    brandPerceptionConsensus: 0-100,   // Positioning agreement
    informationCompleteness: {...},    // Per-model completeness
    divergenceIndex: 0-100             // Model disagreement degree
  },
  brandPerceptions: {
    byModel: {
      "gpt-4": {
        positioning: ["Enterprise", "Innovative"],
        keyStrengths: ["scalable", "reliable"],
        weaknesses: ["expensive"],
        missingInformation: ["pricing details"],
        tone: "positive",
        confidence: 85
      }
      // ... per model
    },
    sharedPerceptions: [...],          // All models agree on these
    divergentPerceptions: [...]        // Where models disagree
  },
  geoRelevantFindings: {
    citationLikelihood: {...},         // Probability of mention per model
    knowledgeGaps: [...],              // Missing information per model
    contentPreferences: {...}          // What each model prefers
  },
  sentimentAnalysis: {
    overall: "positive|neutral|negative|mixed",
    breakdown: { positive: 60, neutral: 30, negative: 10 }
  }
}
```

### GeneratedGEOInsights

```typescript
{
  executiveSummary: "...",
  geoOptimizationStrategy: {
    overallStrategy: "...",
    priorityLevel: "critical|high|medium",
    expectedMentionLiftPercentage: 25
  },
  modelSpecificRecommendations: [
    {
      model: "gpt-4",
      currentMentionRate: 45,
      targetMentionRate: 60,
      contentOptimization: {
        focusAreas: [...],
        languagePreferences: [...],
        structuringTips: [...]
      },
      riskFactors: [...],
      quickWins: [...]
    }
  ],
  contentStrategies: [...],
  recommendedContentStructure: {...},
  cognitiveGapRepair: [...]
}
```

## Configuration

### Environment Variables

Required:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `POE_API_KEY` - Poe API key (get from https://poe.com/api)
- `ANTHROPIC_API_KEY` - Anthropic API key (get from console.anthropic.com)

Optional:
- `INTERNAL_API_SECRET` - Secret for internal API calls
- `OPENAI_API_KEY` - OpenAI API key for additional features
- `NEXT_PUBLIC_APP_URL` - Application URL (for callbacks)

### Database Setup

Run migrations:
```bash
npx supabase db push  # Local development
```

For production, use Supabase CLI:
```bash
supabase db remote set <connection-string>
supabase db push
```

## Usage

### Frontend Component

The Multi-Model Analyzer component is available in the SOV Dashboard:

1. Navigate to `/sov-dashboard`
2. Click "Multi-Model Analysis" tab
3. Configure:
   - Brand name
   - Question set (upload file or type manually)
   - Select LLMs to query
4. Click "Execute Analysis"
5. Wait for results (typically 30-60 seconds)

### Polling

The frontend automatically polls for status:
```javascript
GET /api/multi-model-query/[queryId]
```

Check `status` field:
- `processing` - Still running
- `completed` - Results ready
- `failed` - Error occurred

### Caching

Results are cached for 7 days. Cache key is generated from:
- Question set hash
- Model set
- Brand name

Identical queries will return cached results within 2 seconds.

## Cost Management

### Cost Estimation

Before execution, the system estimates costs:

```
Model Costs (per 1000 tokens):
- GPT-4: $0.03
- Claude Opus: $0.015
- Gemini Pro: $0.005
- Perplexity: $0.008
- DeepSeek: $0.002
```

Example for 10 questions × 3 models:
- Input tokens: ~100 per question
- Output tokens: ~500 per question
- Total cost: $1-5 depending on model selection

### Quota Management

The system tracks:
- Daily cost limits
- Monthly usage
- Per-query cost
- Available quota

Current limits (configurable):
- Monthly budget: $1000
- Daily limit: $100
- Per-query limit: $50

## Troubleshooting

### Query Stuck in Processing

1. Check Poe API status
2. Verify API keys are correct
3. Check database connectivity
4. Review logs: `tail -f /tmp/next_dev.log`

### Missing GEO Insights

1. Verify ANTHROPIC_API_KEY is set
2. Ensure Claude is accessible
3. Check error logs for API issues

### High Costs

1. Use "speed" priority instead of "quality"
2. Select fewer models
3. Use DeepSeek/Perplexity instead of GPT-4/Claude Opus
4. Enable caching by using identical queries

### Slow Response Times

1. Use "speed" priority (8s timeout vs 30s)
2. Reduce number of models
3. Results are typically ready within 45-60 seconds
4. Cached results return within 2 seconds

## Advanced Features

### Custom Model Configuration

Edit `lib/poe-client.ts` MODEL_CONFIG to:
- Add new models
- Adjust cost per token
- Modify timeout values
- Change retry counts

### Custom Aggregation Logic

Modify `lib/llm-aggregator.ts` to:
- Change semantic similarity algorithm
- Add domain-specific metrics
- Customize consensus calculation
- Add new entity extraction

### GEO Insight Customization

Modify `lib/geo-insight-generator.ts` to:
- Change Claude prompts
- Add custom metrics
- Implement industry-specific insights
- Adjust recommendation generation

## Performance Metrics

### Typical Performance

- Query execution: 30-60 seconds
- Aggregation: 2-5 seconds
- GEO insight generation: 10-20 seconds
- Total time: 45-85 seconds

### Optimization

- Cache hit: 2 second response
- Parallel queries: 4 concurrent requests
- Batch processing: Chain multiple queries

## Monitoring

### Logs

Check application logs:
```bash
tail -f /tmp/next_dev.log
```

### Database

Query execution metrics:
```sql
SELECT 
  status,
  COUNT(*) as count,
  AVG(processing_duration_ms) as avg_duration,
  AVG(total_cost_cents) as avg_cost
FROM multi_model_queries_v2
GROUP BY status;
```

### Cache Performance

```sql
SELECT 
  query_hash,
  hit_count,
  last_accessed_at
FROM geo_analysis_cache
ORDER BY hit_count DESC
LIMIT 10;
```

## Future Enhancements

Planned features:
1. Real-time streaming results (WebSocket)
2. Multi-language question translation
3. Competitor comparison matrix
4. Historical trend analysis
5. Custom metric definitions
6. API rate limiting and quotas
7. Webhooks for async notifications
8. Advanced visualization dashboards

## API Rate Limits

Current limits:
- Poe API: Per your subscription tier
- Anthropic API: 50 RPM (standard), configurable
- Internal API: No limit (internal only)

## Support

For issues or questions:
1. Check logs in `/tmp/next_dev.log`
2. Review .env.local configuration
3. Verify API keys are valid
4. Check Supabase database connectivity
5. Test individual API endpoints with curl

## See Also

- [Poe API Documentation](https://poe.com/api)
- [Anthropic Claude API](https://console.anthropic.com)
- [Supabase Documentation](https://supabase.com/docs)
- [GEO Principles](./GEO-PRINCIPLES.md) (if available)
