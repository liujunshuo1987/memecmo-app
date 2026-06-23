'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Zap,
  Upload,
  Globe,
  Settings,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface BrandIntelligence {
  analysis: {
    positioning: string[];
    keyStrengths: string[];
    targetAudience: string[];
    marketPosition: string;
  };
  generatedQuestions: Array<{
    category: string;
    subcategory: string;
    question: string;
    geoRelevance: string;
  }>;
  questionsByCategory: Record<string, any[]>;
  executiveContext: string;
}

export function BrandIntelligenceAutoAnalyzer() {
  const [step, setStep] = useState<'input' | 'analyzing' | 'results' | 'executing'>('input');
  const [brandName, setBrandName] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [targetMarkets, setTargetMarkets] = useState('');
  const [language, setLanguage] = useState('en');
  const [intelligence, setIntelligence] = useState<BrandIntelligence | null>(null);
  const [autoExecute, setAutoExecute] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState(['gpt-4', 'claude-opus', 'gemini-pro']);

  const handleAnalyzeBrand = async () => {
    if (!brandName.trim()) {
      setError('Please enter a brand name');
      return;
    }

    setStep('analyzing');
    setError(null);

    try {
      const response = await fetch('/api/auto-analyze-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandName: brandName.trim(),
          description: description || undefined,
          website: website || undefined,
          industry: industry || undefined,
          targetMarkets: targetMarkets
            ? targetMarkets.split(',').map((m) => m.trim())
            : undefined,
          language,
          autoExecute,
          models: selectedModels,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setIntelligence(data);
        setStep(autoExecute ? 'executing' : 'results');
      } else {
        const err = await response.json();
        setError(err.error || 'Failed to generate brand intelligence');
        setStep('input');
      }
    } catch (err) {
      setError('Error analyzing brand');
      setStep('input');
    }
  };

  return (
    <div className="space-y-6">
      {/* Step 1: Brand Information Input */}
      {step === 'input' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Auto-Generate GEO Analysis
            </CardTitle>
            <CardDescription>
              Enter brand information, and we'll automatically generate questions based on GEO principles
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Brand Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Brand Name *</label>
              <input
                type="text"
                placeholder="e.g., OpenAI, Figma, Your Company"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Brand Description</label>
              <textarea
                placeholder="What does your brand do? Key differentiators?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background h-24"
              />
            </div>

            {/* Website */}
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Website URL
              </label>
              <input
                type="url"
                placeholder="https://example.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
              />
            </div>

            {/* Industry & Markets */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Industry</label>
                <input
                  type="text"
                  placeholder="e.g., SaaS, AI, Finance"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Target Markets</label>
                <input
                  type="text"
                  placeholder="e.g., US, EU, APAC (comma separated)"
                  value={targetMarkets}
                  onChange={(e) => setTargetMarkets(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-md bg-background"
                />
              </div>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Input Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
              >
                <option value="en">English</option>
                <option value="zh">中文 (Chinese)</option>
                <option value="es">Español (Spanish)</option>
                <option value="fr">Français (French)</option>
                <option value="de">Deutsch (German)</option>
                <option value="ja">日本語 (Japanese)</option>
              </select>
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Models</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  { id: 'gpt-4', label: 'GPT-4' },
                  { id: 'claude-opus', label: 'Claude Opus' },
                  { id: 'gemini-pro', label: 'Gemini Pro' },
                  { id: 'perplexity', label: 'Perplexity' },
                  { id: 'deepseek', label: 'DeepSeek' },
                ].map((model) => (
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
                        : 'border-border bg-background hover:border-primary'
                    }`}
                  >
                    {model.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-Execute Option */}
            <div className="flex items-center gap-3 p-3 rounded-md bg-secondary/50 border border-border">
              <input
                type="checkbox"
                id="autoExecute"
                checked={autoExecute}
                onChange={(e) => setAutoExecute(e.target.checked)}
                className="w-4 h-4"
              />
              <label htmlFor="autoExecute" className="text-sm cursor-pointer flex-1">
                <div className="font-medium">Auto-Execute Multi-Model Analysis</div>
                <div className="text-xs text-muted-foreground">
                  Automatically run the generated questions against selected models
                </div>
              </label>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 inline mr-2" />
                {error}
              </div>
            )}

            {/* Analyze Button */}
            <Button
              onClick={handleAnalyzeBrand}
              disabled={!brandName}
              className="w-full gap-2"
              size="lg"
            >
              <Zap className="w-4 h-4" />
              Generate GEO Questions
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Analyzing */}
      {step === 'analyzing' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating GEO Analysis...
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                <span className="text-sm">Analyzing brand information...</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                <span className="text-sm">Generating GEO-optimized questions...</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Results */}
      {(step === 'results' || step === 'executing') && intelligence && (
        <div className="space-y-6">
          {/* Executive Summary */}
          <Card>
            <CardHeader>
              <CardTitle>{brandName} - GEO Intelligence Report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded-md bg-blue-500/10 border border-blue-500/20">
                <p className="text-sm text-foreground">{intelligence.executiveContext}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Positioning */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Positioning</div>
                  <div className="space-y-1">
                    {intelligence.analysis.positioning.map((p, i) => (
                      <Badge key={i} variant="outline">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Key Strengths */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Strengths</div>
                  <div className="space-y-1">
                    {intelligence.analysis.keyStrengths.map((s, i) => (
                      <Badge key={i} variant="outline" className="bg-green-500/10 text-green-700">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Target Audience */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Target Audience</div>
                  <div className="space-y-1">
                    {intelligence.analysis.targetAudience.map((a, i) => (
                      <Badge key={i} variant="outline" className="bg-purple-500/10 text-purple-700">
                        {a}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Market Position */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Market Position</div>
                  <div className="text-sm">{intelligence.analysis.marketPosition}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Generated Questions by Category */}
          <Card>
            <CardHeader>
              <CardTitle>Generated GEO Questions</CardTitle>
              <CardDescription>
                {Object.keys(intelligence.questionsByCategory).length} categories,{' '}
                {intelligence.generatedQuestions.length} questions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue={Object.keys(intelligence.questionsByCategory)[0]} className="w-full">
                <TabsList className="grid w-full grid-cols-3 lg:grid-cols-5">
                  {Object.keys(intelligence.questionsByCategory).map((category) => (
                    <TabsTrigger key={category} value={category} className="text-xs">
                      {category}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {Object.entries(intelligence.questionsByCategory).map(([category, questions]) => (
                  <TabsContent key={category} value={category} className="space-y-3 mt-4">
                    {(questions as any[]).map((q, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-md border border-border bg-card hover:border-primary/50 transition-colors"
                      >
                        <div className="font-medium text-sm text-foreground mb-1">{q.question}</div>
                        <div className="text-xs text-muted-foreground">💡 {q.geoRelevance}</div>
                        {q.subcategory && (
                          <Badge variant="secondary" className="mt-2 text-xs">
                            {q.subcategory}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

          {/* Status */}
          {step === 'executing' && (
            <Card className="border-green-500/20 bg-green-500/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="font-medium text-green-700">Multi-Model Analysis Started</div>
                    <div className="text-sm text-green-600">
                      Analysis is running in the background. Check the "Multi-Model Analysis" tab for results.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={() => {
                setStep('input');
                setBrandName('');
                setDescription('');
                setWebsite('');
                setIndustry('');
                setTargetMarkets('');
              }}
              variant="outline"
              className="flex-1"
            >
              Analyze Another Brand
            </Button>
            {!autoExecute && (
              <Button className="flex-1 gap-2">
                <Zap className="w-4 h-4" />
                Run Multi-Model Analysis
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
