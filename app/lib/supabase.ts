import { createClient } from '@supabase/supabase-js';
import { assertIsolatedConfiguration, environment } from './environment';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
assertIsolatedConfiguration(supabaseUrl);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {auth:{detectSessionInUrl:environment==='shared'}});
/** Signup must never replace the administrator's session or broadcast it to other tabs. */
export const createRegistrationClient = () => createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'doodoo-registration-isolated' },
});
