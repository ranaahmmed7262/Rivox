import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Supabase publishable keys are designed for use in client applications.
// Database access is protected by Row Level Security policies.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://vphgxsvwrvxelkyjpofn.supabase.co';
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_S3Drbr1X7kXQa-hSJU0_Tg_mDEWP3TM';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
