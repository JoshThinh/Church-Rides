import { demoApi } from './demo';
import { supabaseApi } from './supabase';
import type { RidesApi } from './types';

/**
 * Uses Supabase when the keys are set in `.env.local`,
 * otherwise falls back to demo mode (data kept in this browser only).
 */
const hasSupabase = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

export const api: RidesApi = hasSupabase ? supabaseApi : demoApi;
