import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

function obfuscateValue(val: string): string {
  if (!val) return '';
  return Buffer.from(val).toString('base64').split('').reverse().join('');
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const repoName = process.env.GITHUB_REPOSITORY ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/` : '/';
  
  const rawAiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY || '';
  const obfuscatedAiKey = obfuscateValue(rawAiKey);
  
  const rawHfKey = process.env.HF_API_KEY || env.HF_API_KEY || '';
  const obfuscatedHfKey = obfuscateValue(rawHfKey);
  
  const supabaseUrl = process.env.SUPABASE_URL || env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || '';
  const supabaseBackupUrl = process.env.SUPABASE_BACKUP_URL || env.SUPABASE_BACKUP_URL || process.env.VITE_SUPABASE_BACKUP_URL || env.VITE_SUPABASE_BACKUP_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
  
  const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_CLOUD_NAME || '';
  const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY || env.CLOUDINARY_API_KEY || '';
  const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET || env.CLOUDINARY_API_SECRET || '';
  
  return {
    base: repoName,
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY_OBFUSCATED': JSON.stringify(obfuscatedAiKey),
      'process.env.HF_API_KEY_OBFUSCATED': JSON.stringify(obfuscatedHfKey),
      'process.env.SUPABASE_URL_OBFUSCATED': JSON.stringify(obfuscateValue(supabaseUrl)),
      'process.env.SUPABASE_BACKUP_URL_OBFUSCATED': JSON.stringify(obfuscateValue(supabaseBackupUrl)),
      'process.env.SUPABASE_ANON_KEY_OBFUSCATED': JSON.stringify(obfuscateValue(supabaseAnonKey)),
      'process.env.SUPABASE_URL': JSON.stringify(supabaseUrl),
      'process.env.SUPABASE_BACKUP_URL': JSON.stringify(supabaseBackupUrl),
      'process.env.SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
      'process.env.CLOUDINARY_CLOUD_NAME': JSON.stringify(cloudinaryCloudName),
      'process.env.CLOUDINARY_API_KEY': JSON.stringify(cloudinaryApiKey),
      'process.env.CLOUDINARY_API_SECRET': JSON.stringify(cloudinaryApiSecret),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
