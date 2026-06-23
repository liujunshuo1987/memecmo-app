import { createClient } from '@supabase/supabase-js';

type QuotaType = 'visibility_scans' | 'geo_audits' | 'brands' | 'competitors' | 'api_calls';

interface QuotaCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

const columnMap: Record<QuotaType, { used: string; limit: string }> = {
  visibility_scans: { used: 'visibility_scans_used', limit: 'visibility_scans_limit' },
  geo_audits: { used: 'geo_audits_used', limit: 'geo_audits_limit' },
  brands: { used: 'brands_count', limit: 'brands_limit' },
  competitors: { used: 'competitors_count', limit: 'competitors_limit' },
  api_calls: { used: 'api_calls_used', limit: 'api_calls_limit' },
};

export async function checkQuota(userId: string, quotaType: QuotaType): Promise<QuotaCheckResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const cols = columnMap[quotaType];
  const { data } = await supabase
    .from('usage_quotas')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) {
    return { allowed: false, used: 0, limit: 0, remaining: 0 };
  }

  const row = data as unknown as Record<string, number>;
  const used = row[cols.used] || 0;
  const limit = row[cols.limit] || 0;

  return {
    allowed: limit === 9999 || used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}

export async function incrementQuota(userId: string, quotaType: QuotaType, amount: number = 1): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const cols = columnMap[quotaType];
  await supabase.rpc('increment_quota', {
    p_user_id: userId,
    p_column_name: cols.used,
    p_amount: amount,
  });
}
