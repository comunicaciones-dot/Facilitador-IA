import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fzzexhtfakbmydcbxkgv.supabase.co';
const supabaseKey = 'sb_publishable_R2K-IJCZLi1ehPu5wNOS0g_3Kya90Hl';

export const supabase = createClient(supabaseUrl, supabaseKey);
