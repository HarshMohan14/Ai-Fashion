/*
  # Date or Dump pairwise game

  Replaces the old one-look Date/Dump rating concept with pairwise duels:
  - one anonymous session per playthrough
  - each duel compares two Runway looks from the same model
  - winner increments runway_looks.date_count
  - loser increments runway_looks.dump_count
*/

ALTER TABLE public.runway_looks
  ADD COLUMN IF NOT EXISTS date_count integer NOT NULL DEFAULT 0 CHECK (date_count >= 0),
  ADD COLUMN IF NOT EXISTS dump_count integer NOT NULL DEFAULT 0 CHECK (dump_count >= 0),
  ADD COLUMN IF NOT EXISTS style_quotient_score integer NOT NULL DEFAULT 0 CHECK (style_quotient_score >= 0 AND style_quotient_score <= 100),
  ADD COLUMN IF NOT EXISTS style_quotient_updated_at timestamptz;

DROP FUNCTION IF EXISTS public.record_date_or_dump_rating(text, uuid, uuid, uuid[], text, text, integer);
DROP TABLE IF EXISTS public.date_or_dump_ratings CASCADE;

CREATE TABLE IF NOT EXISTS public.date_or_dump_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_player_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  total_duels integer NOT NULL DEFAULT 10 CHECK (total_duels >= 0),
  completed_duels integer NOT NULL DEFAULT 0 CHECK (completed_duels >= 0),
  result_title text NOT NULL DEFAULT '',
  result_summary text NOT NULL DEFAULT '',
  result_tags text[] NOT NULL DEFAULT '{}',
  gemini_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.date_or_dump_duels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.date_or_dump_sessions(id) ON DELETE CASCADE,
  anonymous_player_id text NOT NULL,
  round_index integer NOT NULL CHECK (round_index > 0),
  model_id uuid REFERENCES public.models_public(id) ON DELETE SET NULL,
  left_look_id uuid NOT NULL REFERENCES public.runway_looks(id) ON DELETE CASCADE,
  right_look_id uuid NOT NULL REFERENCES public.runway_looks(id) ON DELETE CASCADE,
  winner_look_id uuid NOT NULL REFERENCES public.runway_looks(id) ON DELETE CASCADE,
  loser_look_id uuid NOT NULL REFERENCES public.runway_looks(id) ON DELETE CASCADE,
  winner_side text NOT NULL CHECK (winner_side IN ('left', 'right')),
  left_item_ids uuid[] NOT NULL DEFAULT '{}',
  right_item_ids uuid[] NOT NULL DEFAULT '{}',
  scenario text NOT NULL DEFAULT '',
  response_ms integer NOT NULL DEFAULT 0 CHECK (response_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT date_or_dump_duel_distinct_looks CHECK (left_look_id <> right_look_id),
  CONSTRAINT date_or_dump_duel_winner_side_match CHECK (
    (winner_side = 'left' AND winner_look_id = left_look_id AND loser_look_id = right_look_id)
    OR
    (winner_side = 'right' AND winner_look_id = right_look_id AND loser_look_id = left_look_id)
  )
);

ALTER TABLE public.date_or_dump_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.date_or_dump_duels ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_date_or_dump_sessions_anon ON public.date_or_dump_sessions(anonymous_player_id);
CREATE INDEX IF NOT EXISTS idx_date_or_dump_sessions_created ON public.date_or_dump_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_date_or_dump_duels_session ON public.date_or_dump_duels(session_id);
CREATE INDEX IF NOT EXISTS idx_date_or_dump_duels_model ON public.date_or_dump_duels(model_id);
CREATE INDEX IF NOT EXISTS idx_date_or_dump_duels_winner ON public.date_or_dump_duels(winner_look_id);
CREATE INDEX IF NOT EXISTS idx_date_or_dump_duels_loser ON public.date_or_dump_duels(loser_look_id);
CREATE INDEX IF NOT EXISTS idx_date_or_dump_duels_created ON public.date_or_dump_duels(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_date_or_dump_duels_session_round ON public.date_or_dump_duels(session_id, round_index);

DROP POLICY IF EXISTS "Anyone can view date or dump sessions" ON public.date_or_dump_sessions;
CREATE POLICY "Anyone can view date or dump sessions"
  ON public.date_or_dump_sessions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can insert date or dump sessions" ON public.date_or_dump_sessions;
CREATE POLICY "Anyone can insert date or dump sessions"
  ON public.date_or_dump_sessions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update date or dump sessions" ON public.date_or_dump_sessions;
CREATE POLICY "Anyone can update date or dump sessions"
  ON public.date_or_dump_sessions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete date or dump sessions" ON public.date_or_dump_sessions;
CREATE POLICY "Anyone can delete date or dump sessions"
  ON public.date_or_dump_sessions FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view date or dump duels" ON public.date_or_dump_duels;
CREATE POLICY "Anyone can view date or dump duels"
  ON public.date_or_dump_duels FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can insert date or dump duels" ON public.date_or_dump_duels;
CREATE POLICY "Anyone can insert date or dump duels"
  ON public.date_or_dump_duels FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update date or dump duels" ON public.date_or_dump_duels;
CREATE POLICY "Anyone can update date or dump duels"
  ON public.date_or_dump_duels FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete date or dump duels" ON public.date_or_dump_duels;
CREATE POLICY "Anyone can delete date or dump duels"
  ON public.date_or_dump_duels FOR DELETE TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.refresh_date_or_dump_style_quotient(p_look_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_count integer;
  v_dump_count integer;
  v_total integer;
BEGIN
  SELECT COALESCE(date_count, 0), COALESCE(dump_count, 0)
    INTO v_date_count, v_dump_count
  FROM public.runway_looks
  WHERE id = p_look_id;

  v_total := COALESCE(v_date_count, 0) + COALESCE(v_dump_count, 0);

  UPDATE public.runway_looks
  SET style_quotient_score = CASE
        WHEN v_total > 0 THEN ROUND((COALESCE(v_date_count, 0)::numeric / v_total::numeric) * 100)::integer
        ELSE 0
      END,
      style_quotient_updated_at = now()
  WHERE id = p_look_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_date_or_dump_duel(
  p_session_id uuid,
  p_anonymous_player_id text,
  p_round_index integer,
  p_model_id uuid,
  p_left_look_id uuid,
  p_right_look_id uuid,
  p_winner_look_id uuid,
  p_loser_look_id uuid,
  p_winner_side text,
  p_left_item_ids uuid[],
  p_right_item_ids uuid[],
  p_scenario text,
  p_response_ms integer
)
RETURNS public.date_or_dump_duels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duel public.date_or_dump_duels;
BEGIN
  IF p_winner_side NOT IN ('left', 'right') THEN
    RAISE EXCEPTION 'Invalid Date or Dump winner side: %', p_winner_side;
  END IF;

  IF p_left_look_id = p_right_look_id THEN
    RAISE EXCEPTION 'Date or Dump duel requires two different looks.';
  END IF;

  IF p_winner_side = 'left' AND (p_winner_look_id <> p_left_look_id OR p_loser_look_id <> p_right_look_id) THEN
    RAISE EXCEPTION 'Date or Dump left winner payload mismatch.';
  END IF;

  IF p_winner_side = 'right' AND (p_winner_look_id <> p_right_look_id OR p_loser_look_id <> p_left_look_id) THEN
    RAISE EXCEPTION 'Date or Dump right winner payload mismatch.';
  END IF;

  INSERT INTO public.date_or_dump_duels (
    session_id,
    anonymous_player_id,
    round_index,
    model_id,
    left_look_id,
    right_look_id,
    winner_look_id,
    loser_look_id,
    winner_side,
    left_item_ids,
    right_item_ids,
    scenario,
    response_ms
  )
  VALUES (
    p_session_id,
    p_anonymous_player_id,
    GREATEST(COALESCE(p_round_index, 1), 1),
    p_model_id,
    p_left_look_id,
    p_right_look_id,
    p_winner_look_id,
    p_loser_look_id,
    p_winner_side,
    COALESCE(p_left_item_ids, '{}'),
    COALESCE(p_right_item_ids, '{}'),
    COALESCE(p_scenario, ''),
    GREATEST(COALESCE(p_response_ms, 0), 0)
  )
  RETURNING * INTO v_duel;

  UPDATE public.runway_looks
  SET date_count = COALESCE(date_count, 0) + 1,
      style_quotient_updated_at = now()
  WHERE id = p_winner_look_id;

  UPDATE public.runway_looks
  SET dump_count = COALESCE(dump_count, 0) + 1,
      style_quotient_updated_at = now()
  WHERE id = p_loser_look_id;

  PERFORM public.refresh_date_or_dump_style_quotient(p_winner_look_id);
  PERFORM public.refresh_date_or_dump_style_quotient(p_loser_look_id);

  UPDATE public.date_or_dump_sessions
  SET completed_duels = (
        SELECT COUNT(*)
        FROM public.date_or_dump_duels
        WHERE session_id = p_session_id
      ),
      updated_at = now()
  WHERE id = p_session_id;

  RETURN v_duel;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_date_or_dump_style_quotient(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_date_or_dump_duel(uuid, text, integer, uuid, uuid, uuid, uuid, uuid, text, uuid[], uuid[], text, integer)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
