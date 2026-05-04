import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import 'dotenv/config';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function apply() {
  const sql = fs.readFileSync('ADMIN_SETTINGS_FIX_3.sql', 'utf8');
}
apply();
