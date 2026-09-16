-- E-mail support application : contact@theloop-app.com (remplace contact@theloop.gn dans le contenu éditorial)

UPDATE public.app_faq
SET answer = REPLACE(answer, 'contact@theloop.gn', 'contact@theloop-app.com')
WHERE answer LIKE '%contact@theloop.gn%';

UPDATE public.app_legal_content
SET body = REPLACE(body, 'contact@theloop.gn', 'contact@theloop-app.com')
WHERE body LIKE '%contact@theloop.gn%';

UPDATE public.app_content_pages
SET body = REPLACE(body, 'contact@theloop.gn', 'contact@theloop-app.com')
WHERE body LIKE '%contact@theloop.gn%';
