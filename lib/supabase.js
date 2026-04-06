const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Load environment variables (supports both standard and anon keys)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase configuration missing in .env');
}

/**
 * Initialize Supabase Client
 * We add better error handling and logging here.
 */
let supabase;

try {
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
  console.log('🔗 Supabase client initialized.');
} catch (err) {
  console.error('❌ Failed to initialize Supabase client:', err.message);
  // Create a dummy object to prevent crashing
  supabase = {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: null, error: err }) }),
      upsert: () => Promise.resolve({ error: err }),
      update: () => Promise.resolve({ error: err })
    })
  };
}

module.exports = supabase;
