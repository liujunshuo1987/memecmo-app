/**
 * Poe API Client
 * 统一接口用于访问多个 LLM 模型（通过 Poe 平台）
 * 支持：ChatGPT, Claude, Gemini, Perplexity, DeepSeek 等
 */

import axios, { AxiosError } from 'axios';

export type LLMModel = 'gpt-4' | 'claude-opus' | 'gemini-pro' | 'perplexity' | 'deepseek';
export type QueryStrategy = 'speed' | 'quality' | 'cost';

interface PoeMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SingleQueryRequest {
  model: LLMModel;
  messages: PoeMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface PoeResponse {
  model: LLMModel;
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  processingTimeMs: number;
  success: boolean;
  error?: string;
}

export interface QuotaStatus {
  remainingRequests: number;
  resetAt: Date;
  monthlyLimit: number;
  monthlyUsed: number;
  estimatedCostTodayCents: number;
}

interface ModelConfig {
  name: LLMModel;
  poeBot: string; // Poe平台对应的bot名称
  costPerKTokens: number; // 每1000个token的成本（美分）
  maxInputTokens: number;
  maxOutputTokens: number;
  avgLatencyMs: number;
  maxRetries: number;
}

const MODEL_CONFIG: Record<LLMModel, ModelConfig> = {
  'gpt-4': {
    name: 'gpt-4',
    poeBot: 'GPT4', // Poe中的GPT-4 bot
    costPerKTokens: 3, // 约$0.03/1K tokens
    maxInputTokens: 8192,
    maxOutputTokens: 4096,
    avgLatencyMs: 3000,
    maxRetries: 2,
  },
  'claude-opus': {
    name: 'claude-opus',
    poeBot: 'Claude3Opus', // Poe中的Claude 3 Opus bot
    costPerKTokens: 1.5, // 约$0.015/1K tokens
    maxInputTokens: 200000,
    maxOutputTokens: 4096,
    avgLatencyMs: 2500,
    maxRetries: 2,
  },
  'gemini-pro': {
    name: 'gemini-pro',
    poeBot: 'GeminiPro', // Poe中的Gemini Pro bot
    costPerKTokens: 0.5, // 约$0.005/1K tokens
    maxInputTokens: 32000,
    maxOutputTokens: 8192,
    avgLatencyMs: 2000,
    maxRetries: 3,
  },
  'perplexity': {
    name: 'perplexity',
    poeBot: 'PerplexityAI', // Poe中的Perplexity AI bot
    costPerKTokens: 0.8, // 约$0.008/1K tokens
    maxInputTokens: 4000,
    maxOutputTokens: 2000,
    avgLatencyMs: 3500,
    maxRetries: 2,
  },
  'deepseek': {
    name: 'deepseek',
    poeBot: 'DeepSeek', // Poe中的DeepSeek bot
    costPerKTokens: 0.2, // 约$0.002/1K tokens
    maxInputTokens: 4096,
    maxOutputTokens: 2048,
    avgLatencyMs: 2500,
    maxRetries: 3,
  },
};

/**
 * 根据策略选择超时时间
 */
function getTimeoutForStrategy(strategy: QueryStrategy): number {
  switch (strategy) {
    case 'speed':
      return 10000; // 10 秒
    case 'quality':
      return 30000; // 30 秒
    case 'cost':
      return 8000; // 8 秒（快速失败以节省成本）
    default:
      return 20000;
  }
}

/**
 * 估算单个查询的成本（美分）
 */
function estimateQueryCost(model: LLMModel, inputTokens: number, estimatedOutputTokens: number = 500): number {
  const config = MODEL_CONFIG[model];
  const totalTokens = inputTokens + estimatedOutputTokens;
  return (totalTokens / 1000) * config.costPerKTokens;
}

export class PoeClient {
  private apiKey: string;
  private baseUrl = 'https://api.poe.com/api/query';
  private requestCount = 0;
  private costTodayMsCents = 0;
  private dailyResetTime: Date;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('POE_API_KEY not configured');
    }
    this.apiKey = apiKey;
    this.dailyResetTime = this.getNextMidnightUTC();
  }

  private getNextMidnightUTC(): Date {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow;
  }

  /**
   * 单个模型查询（带重试机制）
   */
  private async querySingleModel(
    request: SingleQueryRequest,
    strategy: QueryStrategy,
    attempt: number = 0
  ): Promise<PoeResponse> {
    const config = MODEL_CONFIG[request.model];
    const timeout = getTimeoutForStrategy(strategy);
    const startTime = Date.now();

    try {
      // 构建请求
      const payload = {
        model: config.poeBot,
        messages: request.messages,
        temperature: request.temperature ?? 0.7,
        max_tokens: Math.min(
          request.maxTokens ?? config.maxOutputTokens,
          config.maxOutputTokens
        ),
      };

      // 发送请求到 Poe API
      const response = await axios.post(this.baseUrl, payload, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout,
      });

      const processingTime = Date.now() - startTime;
      const content = response.data.choices?.[0]?.message?.content || '';
      const usage = response.data.usage;

      // 估算成本
      const estimatedCost = estimateQueryCost(
        request.model,
        usage?.prompt_tokens || 0,
        usage?.completion_tokens || 0
      );
      this.costTodayMsCents += estimatedCost;

      return {
        model: request.model,
        content,
        usage: usage && {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
        },
        processingTimeMs: processingTime,
        success: true,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const isAxiosError = axios.isAxiosError(error);

      // 根据错误类型决定是否重试
      if (attempt < config.maxRetries && this.shouldRetry(error)) {
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return this.querySingleModel(request, strategy, attempt + 1);
      }

      const errorMessage = isAxiosError
        ? error.response?.data?.error?.message || error.message
        : String(error);

      return {
        model: request.model,
        content: '',
        processingTimeMs: processingTime,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(error: any): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }

    const status = error.response?.status;
    // 重试 5xx 错误和超时
    return (status && status >= 500) || error.code === 'ECONNABORTED';
  }

  /**
   * 并行查询多个模型
   */
  async parallelQuery(
    questions: string[],
    models: LLMModel[],
    strategy: QueryStrategy = 'quality'
  ): Promise<Map<LLMModel, PoeResponse[]>> {
    const results = new Map<LLMModel, PoeResponse[]>();

    // 为每个模型创建消息列表
    const queries: Array<SingleQueryRequest & { modelName: LLMModel; questionIndex: number }> = [];

    for (const model of models) {
      for (let i = 0; i < questions.length; i++) {
        queries.push({
          model,
          modelName: model,
          questionIndex: i,
          messages: [{ role: 'user', content: questions[i] }],
        });
      }
    }

    // 根据策略决定并行度
    const parallelDegree = strategy === 'speed' ? 4 : strategy === 'cost' ? 1 : 3;
    const queryResponses: Array<PoeResponse & { modelName: LLMModel }> = [];

    // 分批执行查询（避免同时发送过多请求）
    for (let i = 0; i < queries.length; i += parallelDegree) {
      const batch = queries.slice(i, i + parallelDegree);
      const batchResults = await Promise.all(
        batch.map((query) =>
          this.querySingleModel(query, strategy).then((response) => ({
            ...response,
            modelName: query.modelName,
          }))
        )
      );
      queryResponses.push(...batchResults);
    }

    // 按模型组织结果
    for (const model of models) {
      results.set(
        model,
        queryResponses.filter((r) => r.modelName === model)
      );
    }

    return results;
  }

  /**
   * 估算查询成本
   */
  estimateCost(
    models: LLMModel[],
    questions: string[],
    estimatedOutputTokensPerQuestion: number = 500
  ): {
    totalCostCents: number;
    costBreakdown: Record<LLMModel, number>;
  } {
    // 粗略计算输入token数（英文约4字符=1token）
    const avgInputTokens = questions.reduce((sum, q) => sum + q.length / 4, 0) / questions.length;

    const costBreakdown: Record<LLMModel, number> = {} as any;
    let totalCostCents = 0;

    for (const model of models) {
      const costPerQuestion = estimateQueryCost(
        model,
        Math.ceil(avgInputTokens),
        estimatedOutputTokensPerQuestion
      );
      const modelTotalCost = costPerQuestion * questions.length;
      costBreakdown[model] = modelTotalCost;
      totalCostCents += modelTotalCost;
    }

    return { totalCostCents, costBreakdown };
  }

  /**
   * 获取配额状态
   */
  async getQuotaStatus(): Promise<QuotaStatus> {
    // 注：此实现为简化版本，实际应连接 Poe 的配额 API
    // 这里返回本会话的成本追踪
    const now = new Date();
    const resetTime =
      now > this.dailyResetTime ? this.getNextMidnightUTC() : this.dailyResetTime;

    return {
      remainingRequests: 1000 - this.requestCount, // 示例限制
      resetAt: resetTime,
      monthlyLimit: 100000, // 美分，即 $1000
      monthlyUsed: this.costTodayMsCents,
      estimatedCostTodayCents: this.costTodayMsCents,
    };
  }

  /**
   * 重置每日成本计数器（内部用）
   */
  resetDailyCost(): void {
    this.costTodayMsCents = 0;
    this.dailyResetTime = this.getNextMidnightUTC();
  }
}

// 导出工厂函数
export function createPoeClient(): PoeClient {
  const apiKey = process.env.POE_API_KEY;
  if (!apiKey) {
    throw new Error('POE_API_KEY environment variable is not set');
  }
  return new PoeClient(apiKey);
}
