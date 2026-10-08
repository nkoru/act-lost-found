const SUPABASE_URL = "https://qmdcxhlhtotubnpccwnz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_XP1T8uDKdWrTEfew78KXkA_jzk1Ik_j";

const ACTSupabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

window.ACTSupabase = ACTSupabase;