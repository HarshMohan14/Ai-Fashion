/*
  # Drop FirstLook / "What's Your Type?"

  This teardown removes the old FirstLook quiz concept completely:
  - RPC functions
  - analytics/session/response tables
  - quiz packs and scenarios

  Run in Supabase SQL Editor when you want the database cleaned up.
  This permanently deletes FirstLook data.
*/

DROP FUNCTION IF EXISTS public.firstlook_track_event_v2(text, text, uuid, uuid, uuid, uuid, uuid, uuid[], text, integer, integer, integer, jsonb);
DROP FUNCTION IF EXISTS public.firstlook_complete_session_v2(uuid, text);
DROP FUNCTION IF EXISTS public.firstlook_record_reaction_v2(uuid, text, integer, boolean, timestamptz);
DROP FUNCTION IF EXISTS public.firstlook_refresh_item_analytics_v2(uuid);
DROP FUNCTION IF EXISTS public.firstlook_refresh_look_analytics_v2(uuid);
DROP FUNCTION IF EXISTS public.firstlook_create_impression_v2(uuid, text, uuid, uuid, integer, uuid, uuid, uuid[], timestamptz);
DROP FUNCTION IF EXISTS public.firstlook_rate_v2(numeric, numeric);
DROP FUNCTION IF EXISTS public.firstlook_score_for_reaction_v2(text);

DROP FUNCTION IF EXISTS public.firstlook_track_event(text, text, uuid, uuid, uuid, uuid, uuid, uuid[], text, integer, integer, integer, jsonb);
DROP FUNCTION IF EXISTS public.firstlook_complete_session(uuid, text);
DROP FUNCTION IF EXISTS public.firstlook_record_reaction(uuid, text, integer, boolean, timestamptz);
DROP FUNCTION IF EXISTS public.firstlook_record_reaction(uuid, text, integer, boolean, timestamp);
DROP FUNCTION IF EXISTS public.firstlook_record_reaction(uuid, text, integer, boolean);
DROP FUNCTION IF EXISTS public.firstlook_record_reaction(uuid, text, integer, integer, boolean, timestamptz);
DROP FUNCTION IF EXISTS public.firstlook_record_reaction(uuid, text, integer, integer, boolean, timestamp);
DROP FUNCTION IF EXISTS public.firstlook_record_reaction(uuid, text, integer, integer, boolean);
DROP FUNCTION IF EXISTS public.firstlook_refresh_item_analytics(uuid);
DROP FUNCTION IF EXISTS public.firstlook_refresh_look_analytics(uuid);
DROP FUNCTION IF EXISTS public.firstlook_create_impression(uuid, text, uuid, uuid, integer, uuid, uuid, uuid[], timestamptz);
DROP FUNCTION IF EXISTS public.firstlook_create_impression(uuid, text, uuid, uuid, integer, uuid, uuid, uuid[], timestamp);
DROP FUNCTION IF EXISTS public.firstlook_create_impression(uuid, text, uuid, uuid, integer, uuid, uuid, uuid[]);
DROP FUNCTION IF EXISTS public.firstlook_rate(numeric, numeric);
DROP FUNCTION IF EXISTS public.firstlook_score_for_reaction(text);

DROP TABLE IF EXISTS public.firstlook_response_items CASCADE;
DROP TABLE IF EXISTS public.firstlook_events CASCADE;
DROP TABLE IF EXISTS public.firstlook_item_analytics CASCADE;
DROP TABLE IF EXISTS public.firstlook_look_analytics CASCADE;
DROP TABLE IF EXISTS public.firstlook_user_profiles CASCADE;
DROP TABLE IF EXISTS public.firstlook_responses CASCADE;
DROP TABLE IF EXISTS public.firstlook_sessions CASCADE;
DROP TABLE IF EXISTS public.firstlook_scenarios CASCADE;
DROP TABLE IF EXISTS public.firstlook_quiz_packs CASCADE;

NOTIFY pgrst, 'reload schema';
