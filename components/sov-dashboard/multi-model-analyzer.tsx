'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Upload,
  BarChart3,
  Brain,
  Target,
} from 'lucide-react';
import type { LLMModel } from '@/lib/poe-client';

interface QueryStatus {
  queryId: string;
  status: 'processing' | 'completed' | 'partial' | 'failed';
  progress?: {
    stage: string;
    percentage: number;
  };
  results?: {
    modelResponses: Record<string, any>;
    aggregationResult: any;
    geoInsights: any;
  };
  error?: string;
  isCached?: boolean;
}

const DEFAULT_QUESTIONS = [
  'What is [BRAND_NAME]?',
  'What are the key features of [BRAND_NAME]?',
  'Who uses [BRAND_NAME]?',
  'What are the strengths of [BRAND_NAME]?',
  'What are the weaknesses of [BRAND_NAME]?',
];

const AVAILABLE_MODELS: Array<{ id: LLMModel; label: string }> = [
  { id: 'gpt-4', label: 'GPT-4' },
  { id: 'claude-opus', label: 'Claude Opus' },
  { id: 'gemini-pro', label: 'Gemini Pro' },
  { id: 'perplexity', label: 'Perplexity' },
  { id: 'deepseek', label: 'DeepSeek' },
];

export function MultiModelAnalyzer() {
  const [questions, setQuestions] = useState<string[]>(DEFAULT_QUESTIONS);
  const [brandName, setBrandName] = useState('');
  const [selectedModels, setSelectedModels] = useState<LLMModel[]>(['gpt-4', 'claude-opus', 'gemini-pro']);
  const [queryStatus, setQueryStatus] = useState<QueryStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Poll for status
  useEffect(() => {
    if (!queryStatus || queryStatus.status === 'completed' || queryStatus.status === 'failed') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      return;
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/multi-model-query/${queryStatus.queryId}`);
        if (response.ok) {
          const data = await response.json();
          setQueryStatus(data);

          if (data.status === 'completed' || data.status === 'failed') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
            }
            setLoading(false);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [queryStatus?.queryId, queryStatus?.status]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        // Try to parse as JSON first
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            setQuestions(parsed);
          }
        } catch {
          // Fall back to line-by-line parsing
          const lines = content.split('\n').filter((line) => line.trim().length > 0);
          setQuestions(lines);
        }
      } catch (error) {
        console.error('Error reading file:', error);
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteQuery = async () => {
    if (!brandName || selectedModels.length === 0 || questions.length === 0) {
      alert('Please fill in all required fields');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/multi-model-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionSet: questions,
          brandName,
          models: selectedModels,
          priority: 'quality',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setQueryStatus({
          queryId: data.queryId,
          status: data.status,
          progress: { stage: 'Initializing...', percentage: 10 },
        });
      } else {
        alert('Failed to execute query');
        setLoading(false);
      }
    } catch (error) {
      console.error('Query execution error:', error);
      alert('Error executing query');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Multi-Model LLM Analysis
          </CardTitle>
          <CardDescription>
            Compare how different LLMs perceive and represent your brand
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Brand Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Brand Name *</label>
            <input
              type="text"
              placeholder="e.g., Your Company Name"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground"
            />
          </div>

          {/* Questions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Questions ({questions.length}/50) *</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.json"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <Upload className="w-4 h-4" />
                Upload File
              </Button>
            </div>
            <textarea
              value={questions.join('\n')}
              onChange={(e) => setQuestions(e.target.value.split('\n').filter((q) => q.trim()))}
              placeholder="One question per line"
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground h-40 font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Use [BRAND_NAME] as a placeholder to auto-replace with your brand name
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Models *</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {AVAILABLE_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    setSelectedModels((prev) =>
                      prev.includes(model.id)
                        ? prev.filter((m) => m !== model.id)
                        : [...prev, model.id]
                    );
                  }}
                  className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${
                    selectedModels.includes(model.id)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-foreground hover:border-primary'
                  }`}
                >
                  {model.label}
                </button>
              ))}
            </div>
          </div>

          {/* Execute Button */}
          <Button
            onClick={handleExecuteQuery}
            disabled={loading || !brandName || selectedModels.length === 0}
            className="w-full gap-2"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <BarChart3 className="w-4 h-4" />
                Execute Analysis
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Status Panel */}
      {queryStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Analysis Status</span>
              {queryStatus.status === 'completed' && (
                <Badge className="bg-green-500/20 text-green-700 border-green-500/50">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Completed
                </Badge>
              )}
              {queryStatus.status === 'processing' && (
                <Badge className="bg-blue-500/20 text-blue-700 border-blue-500/50">
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  Processing
                </Badge>
              )}
              {queryStatus.status === 'failed' && (
                <Badge className="bg-red-500/20 text-red-700 border-red-500/50">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Failed
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {queryStatus.progress && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>{queryStatus.progress.stage}</span>
                    <span className="text-xs text-muted-foreground">{queryStatus.progress.percentage}%</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${queryStatus.progress.percentage}%` }}
                    />
                  </div>
                </div>
              </>
            )}

            {queryStatus.results && (
              <Tabs defaultValue="sentiment" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="sentiment">Sentiment</TabsTrigger>
                  <TabsTrigger value="consensus">Consensus</TabsTrigger>
                  <TabsTrigger value="insights">GEO Insights</TabsTrigger>
                </TabsList>

                <TabsContent value="sentiment" className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {queryStatus.results.aggregationResult?.sentimentAnalysis?.breakdown && (
                      <>
                        <div className="p-3 rounded-md bg-green-500/10 border border-green-500/20">
                          <div className="text-sm text-muted-foreground">Positive</div>
                          <div className="text-xl font-bold text-green-600">
                            {queryStatus.results.aggregationResult.sentimentAnalysis.breakdown.positive}%
                          </div>
                        </div>
                        <div className="p-3 rounded-md bg-gray-500/10 border border-gray-500/20">
                          <div className="text-sm text-muted-foreground">Neutral</div>
                          <div className="text-xl font-bold text-gray-600">
                            {queryStatus.results.aggregationResult.sentimentAnalysis.breakdown.neutral}%
                          </div>
                        </div>
                        <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20">
                          <div className="text-sm text-muted-foreground">Negative</div>
                          <div className="text-xl font-bold text-red-600">
                            {queryStatus.results.aggregationResult.sentimentAnalysis.breakdown.negative}%
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="consensus" className="space-y-2">
                  {queryStatus.results.aggregationResult?.consensusAnalysis && (
                    <div className="space-y-3">
                      <div className="p-3 rounded-md bg-primary/10 border border-primary/20">
                        <div className="text-sm text-muted-foreground">Overall Consensus</div>
                        <div className="text-2xl font-bold text-primary">
                          {queryStatus.results.aggregationResult.consensusAnalysis.overallConsensus.toFixed(1)}%
                        </div>
                      </div>
                      <div className="p-3 rounded-md bg-secondary">
                        <div className="text-sm text-muted-foreground mb-2">Brand Perception Consensus</div>
                        <div className="text-lg font-bold">
                          {queryStatus.results.aggregationResult.consensusAnalysis.brandPerceptionConsensus.toFixed(1)}%
                        </div>
                      </div>
                      {queryStatus.results.aggregationResult.geoRelevantFindings?.knowledgeGaps && (
                        <div className="p-3 rounded-md bg-yellow-500/10 border border-yellow-500/20">
                          <div className="text-sm font-medium text-yellow-700 mb-2">Knowledge Gaps</div>
                          <ul className="text-sm space-y-1">
                            {queryStatus.results.aggregationResult.geoRelevantFindings.knowledgeGaps.map((gap: string, i: number) => (
                              <li key={i} className="text-yellow-600">
                                • {gap}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="insights" className="space-y-3">
                  {queryStatus.results.geoInsights ? (
                    <div className="space-y-4">
                      <div className="p-3 rounded-md bg-blue-500/10 border border-blue-500/20">
                        <div className="text-sm font-medium text-blue-700 mb-2">Executive Summary</div>
                        <p className="text-sm text-foreground">{queryStatus.results.geoInsights.executiveSummary}</p>
                      </div>

                      {queryStatus.results.geoInsights.geoOptimizationStrategy && (
                        <div className="p-3 rounded-md bg-purple-500/10 border border-purple-500/20">
                          <div className="text-sm font-medium text-purple-700 mb-2">GEO Strategy</div>
                          <p className="text-sm text-foreground mb-2">
                            {queryStatus.results.geoInsights.geoOptimizationStrategy.overallStrategy}
                          </p>
                          <Badge className="bg-purple-500/20 text-purple-700 border-purple-500/50">
                            {queryStatus.results.geoInsights.geoOptimizationStrategy.priorityLevel}
                          </Badge>
                          <div className="text-xs text-purple-600 mt-2">
                            Expected Lift: {queryStatus.results.geoInsights.geoOptimizationStrategy.expectedMentionLiftPercentage}%
                          </div>
                        </div>
                      )}

                      {queryStatus.results.geoInsights.modelSpecificRecommendations?.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-sm font-medium">Model-Specific Recommendations</div>
                          {queryStatus.results.geoInsights.modelSpecificRecommendations.map((rec: any, i: number) => (
                            <div
                              key={i}
                              className="p-2 rounded-md bg-secondary border border-border text-sm"
                            >
                              <div className="font-medium text-foreground">{rec.model}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Current: {rec.currentMentionRate.toFixed(1)}% → Target: {rec.targetMentionRate.toFixed(1)}%
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">GEO insights are being generated...</p>
                  )}
                </TabsContent>
              </Tabs>
            )}

            {queryStatus.error && (
              <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-700">
                {queryStatus.error}
              </div>
            )}

            {queryStatus.isCached && (
              <div className="p-2 rounded-md bg-green-500/10 border border-green-500/20 text-xs text-green-700">
                ✓ Results loaded from cache
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
