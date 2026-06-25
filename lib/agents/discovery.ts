// Discovery Agent (v0.5 — mock implementation)
//
// Real version (v0.6) will call Poe / Claude to generate prompts.
// This mock emits realistic-looking events so the workspace UI can be
// exercised end-to-end without burning LLM tokens.

type EventEmitter = (event: {
  event_type:
    | 'log'
    | 'tool_call'
    | 'tool_result'
    | 'progress'
    | 'output_chunk'
    | 'error'
    | 'milestone';
  payload: Record<string, unknown>;
}) => Promise<void>;

interface DiscoveryInput {
  brandName: string;
  brandUrl?: string | null;
  targetCountry: string;
  industry?: string | null;
  userPrompt?: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function runDiscoveryAgent(
  input: DiscoveryInput,
  emit: EventEmitter,
): Promise<{ summary: string; output: Record<string, unknown> }> {
  const { brandName, targetCountry, industry } = input;

  await emit({
    event_type: 'milestone',
    payload: { label: 'Discovery started', step: 1, totalSteps: 5 },
  });
  await emit({
    event_type: 'log',
    payload: { text: `Profiling brand: ${brandName} (target: ${targetCountry})` },
  });
  await sleep(400);

  await emit({
    event_type: 'tool_call',
    payload: { tool: 'web_fetch', args: { url: input.brandUrl || `inferred for ${brandName}` } },
  });
  await sleep(700);
  await emit({
    event_type: 'tool_result',
    payload: {
      tool: 'web_fetch',
      result: `Mocked: detected industry "${industry ?? 'Marketing / Media'}", ~12 product categories.`,
    },
  });

  await emit({ event_type: 'progress', payload: { pct: 20 } });
  await emit({
    event_type: 'milestone',
    payload: { label: 'Industry verticals identified', step: 2, totalSteps: 5 },
  });
  await sleep(500);

  const subVerticals = [
    'elevator media',
    'OOH digital signage',
    'office building network',
    'brand campaign management',
  ];
  await emit({
    event_type: 'log',
    payload: {
      text: `Sub-verticals: ${subVerticals.join(', ')}`,
    },
  });
  await emit({ event_type: 'progress', payload: { pct: 40 } });
  await sleep(500);

  await emit({
    event_type: 'milestone',
    payload: { label: 'Generating prompt set', step: 3, totalSteps: 5 },
  });

  // Mocked prompt categories with sample prompts
  const promptCategories = [
    {
      category: 'discovery',
      label: 'Awareness-stage discovery',
      prompts: [
        `Best ${industry ?? 'marketing'} agencies in ${targetCountry}`,
        `Who are the top elevator-media players in ${targetCountry}?`,
        `Compare ${brandName} vs international OOH brands operating in ${targetCountry}`,
      ],
    },
    {
      category: 'consideration',
      label: 'Consideration-stage research',
      prompts: [
        `Pricing of elevator advertising in ${targetCountry}`,
        `How does ${brandName} measure ROI?`,
        `${brandName} case studies in ${targetCountry}`,
      ],
    },
    {
      category: 'evaluation',
      label: 'Evaluation / decision',
      prompts: [
        `Pros and cons of ${brandName} for B2B campaigns`,
        `Is ${brandName} a good fit for a Vietnamese F&B brand?`,
        `Customer reviews of ${brandName}`,
      ],
    },
    {
      category: 'competitive',
      label: 'Competitive positioning',
      prompts: [
        `${brandName} vs Lifesight`,
        `Which Vietnamese media network has the most premium office tower coverage?`,
        `Innovation pipeline of ${brandName}`,
      ],
    },
  ];
  for (const cat of promptCategories) {
    await emit({
      event_type: 'output_chunk',
      payload: { kind: 'prompt_category', value: cat },
    });
    await sleep(300);
  }
  await emit({ event_type: 'progress', payload: { pct: 75 } });

  await emit({
    event_type: 'milestone',
    payload: { label: 'Persisting asset', step: 4, totalSteps: 5 },
  });
  await sleep(300);

  const finalOutput = {
    brand: brandName,
    country: targetCountry,
    industry: industry ?? 'Marketing / Media',
    subVerticals,
    promptSet: promptCategories,
    promptCountSampled: promptCategories.reduce((n, c) => n + c.prompts.length, 0),
    note: 'v0.5 mock — sample 12 prompts shown. v0.6 will generate full 100-prompt set via Poe.',
  };

  await emit({ event_type: 'progress', payload: { pct: 100 } });
  await emit({
    event_type: 'milestone',
    payload: { label: 'Discovery complete', step: 5, totalSteps: 5 },
  });

  return {
    summary: `Drafted prompt set across 4 categories (${finalOutput.promptCountSampled} sample prompts). Industry: ${finalOutput.industry}.`,
    output: finalOutput,
  };
}
