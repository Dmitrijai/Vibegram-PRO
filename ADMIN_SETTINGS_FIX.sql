ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tech support can insert admin_settings" ON public.admin_settings;
CREATE POLICY "Tech support can insert admin_settings" ON public.admin_settings
    FOR INSERT WITH CHECK (
        COALESCE((SELECT (settings->>'is_tech_support')::boolean FROM public.profiles WHERE id = auth.uid()), false) = true
    );

-- Предустанавливаем базовые настройки, если их нет
INSERT INTO public.admin_settings (key, value) VALUES ('weekly_vib_bonus', '15'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.admin_settings (key, value) VALUES ('premium_30d_price', '50'::jsonb) ON CONFLICT (key) DO NOTHING;
INSERT INTO public.admin_settings (key, value) VALUES ('premium_365d_price', '300'::jsonb) ON CONFLICT (key) DO NOTHING;
