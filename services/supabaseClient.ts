import { createClient } from '@supabase/supabase-js';

// En Vercel, las variables se inyectan en process.env
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const createSafeClient = () => {
  if (!supabaseUrl || !supabaseKey) {
    console.info("Supabase: Variables no encontradas. La aplicación funcionará en modo local.");
    return null;
  }

  try {
    return createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  } catch (error) {
    console.error("Error al inicializar Supabase:", error);
    return null;
  }
};

export const supabase = createSafeClient();