-- Fusionne le rôle tool_partner dans partner (un seul rôle partenaire).

UPDATE public.users
SET user_role = 'partner',
    updated_at = NOW()
WHERE user_role = 'tool_partner';

DELETE FROM public.platform_roles
WHERE slug = 'tool_partner';
