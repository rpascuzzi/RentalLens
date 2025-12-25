import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Property {
  id: string;
  name: string;
  address: string;
  image_url?: string;
  created_at: string;
}

export interface InventoryItem {
  name: string;
  count: number;
  condition: string;
}

export interface ScanData {
  id: string;
  created_at: string;
  room_name: string;
  status: string;
  image_path: string;
  property_id: string;
  ai_analysis: InventoryItem[] | { items: InventoryItem[]; location?: string };
}
