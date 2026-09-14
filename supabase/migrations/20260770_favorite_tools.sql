-- Favoris outils (table dédiée — favorite_spots référence establishments uniquement)

CREATE TABLE IF NOT EXISTS public.favorite_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_tool_favorite UNIQUE (user_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_tools_user ON public.favorite_tools(user_id);
CREATE INDEX IF NOT EXISTS idx_favorite_tools_tool ON public.favorite_tools(tool_id);

COMMENT ON TABLE public.favorite_tools IS 'Favoris outils par utilisateur.';

ALTER TABLE public.favorite_tools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own favorite tools" ON public.favorite_tools;
CREATE POLICY "Users read own favorite tools"
  ON public.favorite_tools FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert own favorite tools" ON public.favorite_tools;
CREATE POLICY "Users insert own favorite tools"
  ON public.favorite_tools FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.is_active, TRUE) = TRUE
        AND u.user_role IN ('member', 'prime', 'partner', 'admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Users delete own favorite tools" ON public.favorite_tools;
CREATE POLICY "Users delete own favorite tools"
  ON public.favorite_tools FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Compteur favoris sur tools
CREATE OR REPLACE FUNCTION public.refresh_tool_favorite_count(p_tool_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tools t
  SET favorite_count = (
    SELECT COUNT(*)::INTEGER FROM public.favorite_tools f WHERE f.tool_id = p_tool_id
  )
  WHERE t.id = p_tool_id;

  PERFORM public.recalculate_tool_engagement(p_tool_id);
EXCEPTION
  WHEN undefined_function THEN
    NULL; -- recalculate_tool_engagement peut être absent si 20260769 pas encore appliqué
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_favorite_tools_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_tool_favorite_count(OLD.tool_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_tool_favorite_count(NEW.tool_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_favorite_tools_count ON public.favorite_tools;
CREATE TRIGGER trg_favorite_tools_count
  AFTER INSERT OR DELETE ON public.favorite_tools
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_favorite_tools_count();

-- Assouplir aussi les favoris spots pour admin / super_admin (tests Control Tower)
DROP POLICY IF EXISTS "Users insert own favorite spots" ON public.favorite_spots;
CREATE POLICY "Users insert own favorite spots"
  ON public.favorite_spots FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.is_active, TRUE) = TRUE
        AND u.user_role IN ('member', 'prime', 'partner', 'admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "Users insert own favorite events" ON public.favorite_events;
CREATE POLICY "Users insert own favorite events"
  ON public.favorite_events FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND COALESCE(u.is_active, TRUE) = TRUE
        AND u.user_role IN ('member', 'prime', 'partner', 'admin', 'super_admin')
    )
  );
