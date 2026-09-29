-- Templates notif activation PASS : vouvoiement (uniquement si texte seed d’origine inchangé).

DO $$
DECLARE
  k text;
  keys text[] := ARRAY['pass_activation_messages_v1_GN', 'pass_activation_messages_v1'];
  replacements jsonb := jsonb_build_object(
    'pass-msg-heritage',
    'Félicitations : votre {passLabel} vient d''être activé. {validity}. Vous faites désormais partie de Loop Prime : avantages exclusifs, offres partenaires et expériences premium.',
    'pass-msg-monthly',
    'Votre {passLabel} est actif. {validity}. Profitez dès maintenant de tous les avantages Loop Prime.',
    'pass-msg-default',
    'Excellente nouvelle : votre {passLabel} vient d''être activé. {validity}. Bienvenue dans l''expérience Loop Prime !'
  );
  old_templates jsonb := jsonb_build_object(
    'pass-msg-heritage',
    'Félicitations — ton {passLabel} vient d''être activé. {validity}. Tu fais désormais partie de Loop Prime : avantages exclusifs, offres partenaires et expériences premium t''attendent.',
    'pass-msg-monthly',
    'Ton {passLabel} est actif. {validity}. Profite dès maintenant de tous les avantages Prime.',
    'pass-msg-default',
    'Excellente nouvelle : ton {passLabel} vient d''être activé. {validity}. Bienvenue dans l''expérience Loop Prime !'
  );
  arr jsonb;
  new_arr jsonb;
  elem jsonb;
  elem_id text;
  i int;
BEGIN
  FOREACH k IN ARRAY keys LOOP
    SELECT value INTO arr FROM public.app_settings WHERE key = k;
    IF arr IS NULL OR jsonb_typeof(arr) <> 'array' THEN
      CONTINUE;
    END IF;

    new_arr := '[]'::jsonb;
    FOR i IN 0 .. jsonb_array_length(arr) - 1 LOOP
      elem := arr -> i;
      elem_id := elem ->> 'id';
      IF elem_id IS NOT NULL
        AND replacements ? elem_id
        AND (elem ->> 'messageTemplate') = (old_templates ->> elem_id)
      THEN
        elem := jsonb_set(elem, '{messageTemplate}', to_jsonb(replacements ->> elem_id));
      END IF;
      new_arr := new_arr || jsonb_build_array(elem);
    END LOOP;

    IF new_arr IS DISTINCT FROM arr THEN
      UPDATE public.app_settings SET value = new_arr WHERE key = k;
    END IF;
  END LOOP;
END $$;
