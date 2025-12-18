import { createClient } from '@supabase/supabase-js';

const getEnv = (key: string): string | undefined => {
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key];
    }
  } catch (e) {}
  return undefined;
};

// Vercel auto-injects these if the Supabase integration is enabled.
// If not provided, we return null to signal "Local Mode" to the app.
const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL') || getEnv('SUPABASE_URL');
const supabaseKey = getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || getEnv('SUPABASE_ANON_KEY');

const createSafeClient = () => {
  if (!supabaseUrl || !supabaseKey) {
    console.info("Supabase: No environment variables found. App will run in Local Mode (no database persistence).");
    return null;
  }

  try {
    return createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      }
    });
  } catch (error) {
    console.error("Failed to initialize Supabase client:", error);
    return null;
  }
};

export const supabase = createSafeClient();