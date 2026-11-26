BEGIN;
CREATE TABLE IF NOT EXISTS public.dinn_creator_lore (
    owner text NOT NULL, story text NOT NULL, format text NOT NULL,
    name_key text NOT NULL UNIQUE, activity_key text NOT NULL UNIQUE, concept jsonb NOT NULL,
    PRIMARY KEY(owner,story), UNIQUE(story,format)
);
CREATE OR REPLACE FUNCTION public.dinn_reserve_agent_lore() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
    INSERT INTO public.dinn_creator_lore(owner,story,format,name_key,activity_key,concept)
    VALUES ('market:' || NEW.id,
        encode(sha256(convert_to((NEW.brief->'asset'->>'symbol') || ' ' || lower(trim(NEW.brief->'article'->>'title')), 'UTF8')), 'hex'),
        coalesce(NEW.brief->>'format','legacy:' || NEW.id),NEW.name_key,NEW.activity_key,NEW.brief->'concept');
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.dinn_reserve_agent_lore() FROM PUBLIC;
DROP TRIGGER IF EXISTS reserve_creator_idea ON public.dinn_agent_ideas;
CREATE TRIGGER reserve_creator_idea AFTER INSERT ON public.dinn_agent_ideas
FOR EACH ROW EXECUTE FUNCTION public.dinn_reserve_agent_lore();
INSERT INTO public.dinn_creator_lore(owner,story,format,name_key,activity_key,concept)
SELECT 'market:' || id,encode(sha256(convert_to((brief->'asset'->>'symbol') || ' ' || lower(trim(brief->'article'->>'title')), 'UTF8')), 'hex'),
       coalesce(brief->>'format','legacy:' || id),name_key,activity_key,brief->'concept'
FROM public.dinn_agent_ideas ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.dinn_prior_ideas(story_key text)
RETURNS TABLE(format text,concept jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT l.format,l.concept FROM public.dinn_creator_lore l WHERE l.story=story_key
$$;
REVOKE ALL ON FUNCTION public.dinn_prior_ideas(text) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT FROM pg_roles WHERE rolname='dinn_near_worker') THEN
    GRANT EXECUTE ON FUNCTION public.dinn_prior_ideas(text) TO dinn_near_worker;
 END IF;
END $$;
COMMIT;
