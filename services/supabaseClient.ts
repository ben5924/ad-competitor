
import { createClient } from '@supabase/supabase-js';

// Default Keys (Fallback)
const DEFAULT_SUPABASE_URL = 'https://vgttotbnzqekovmkvzua.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZndHRvdGJuenFla292bWt2enVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MzU5OTMsImV4cCI6MjA3OTMxMTk5M30.FGsK_dg6vQMwoxlyhHxijyhV6Smjej1KZcZpG8xNbEQ';

// Retrieve keys from Local Storage (User Settings) or use defaults
const getSupabaseConfig = () => {
  const storedUrl = localStorage.getItem('custom_supabase_url');
  const storedKey = localStorage.getItem('custom_supabase_key');
  return {
    url: storedUrl || DEFAULT_SUPABASE_URL,
    key: storedKey || DEFAULT_SUPABASE_KEY
  };
};

const config = getSupabaseConfig();

export const supabase = createClient(config.url, config.key);

export const updateSupabaseConfig = (url: string, key: string) => {
    if (url && key) {
        localStorage.setItem('custom_supabase_url', url);
        localStorage.setItem('custom_supabase_key', key);
    } else {
        localStorage.removeItem('custom_supabase_url');
        localStorage.removeItem('custom_supabase_key');
    }
    // Reload to re-initialize the client
    window.location.reload();
};

export const getCurrentSupabaseConfig = () => {
    return getSupabaseConfig();
};
