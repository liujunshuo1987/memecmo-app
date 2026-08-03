-- Viewer 真只读:agent_runs 的 INSERT 从"可见即可写"收紧为"admin/editor 可写"。
-- 背景:原 runs_insert 策略 WITH CHECK (is_project_visible(project_id)),意味着
-- viewer 角色也能通过 UI 触发计费扫描(实践中被信用点闸门挡住,但权限模型必须
-- 自洽——只读账号交给客户市场团队前,写路径要在 RLS 层关死)。
-- 层级与 is_org_member 保持一致:直属 admin/editor、父渠道商 admin/editor、
-- 根组织成员(运营方交付,与 API isOperator 口径相同)。

CREATE OR REPLACE FUNCTION public.can_dispatch_runs(target_project UUID)
RETURNS BOOLEAN AS $$
DECLARE
  uid UUID := auth.uid();
  proj_org UUID;
BEGIN
  IF uid IS NULL THEN RETURN FALSE; END IF;
  SELECT organization_id INTO proj_org FROM public.projects WHERE id = target_project;
  IF proj_org IS NULL THEN RETURN FALSE; END IF;

  -- 直属组织的 admin/editor
  IF EXISTS (SELECT 1 FROM public.organization_members
             WHERE user_id = uid AND organization_id = proj_org
               AND role IN ('admin','editor')) THEN
    RETURN TRUE;
  END IF;

  -- 父渠道商的 admin/editor(渠道商代终端客户执行)
  IF EXISTS (
    SELECT 1 FROM public.organizations o
    JOIN public.organization_members m ON m.organization_id = o.parent_org_id
    WHERE o.id = proj_org AND m.user_id = uid AND m.role IN ('admin','editor')
  ) THEN
    RETURN TRUE;
  END IF;

  -- 根组织成员(运营方交付)
  IF EXISTS (
    SELECT 1 FROM public.organization_members m
    JOIN public.organizations o ON o.id = m.organization_id
    WHERE m.user_id = uid AND o.type = 'root'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS runs_insert ON public.agent_runs;
CREATE POLICY runs_insert ON public.agent_runs FOR INSERT
  WITH CHECK (public.can_dispatch_runs(project_id));
