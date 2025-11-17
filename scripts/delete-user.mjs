import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // You need this key with admin privileges

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.log('You need the Service Role Key (not the anon key) from Supabase Dashboard:');
  console.log('Settings → API → Service Role Key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function deleteUser(email) {
  console.log(`🔍 Looking for user: ${email}\n`);

  // 1. Find the user
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('❌ Error listing users:', listError);
    return;
  }

  const user = users.users.find(u => u.email === email);
  
  if (!user) {
    console.log('❌ User not found');
    return;
  }

  console.log(`✅ Found user: ${user.email} (ID: ${user.id})\n`);

  // 2. Delete associated bookings first (optional)
  const { error: bookingsError } = await supabase
    .from('bookings')
    .delete()
    .eq('user_id', user.id);

  if (bookingsError) {
    console.log('⚠️  Warning: Could not delete bookings:', bookingsError.message);
  } else {
    console.log('✅ Deleted user bookings\n');
  }

  // 3. Delete the user
  const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

  if (deleteError) {
    console.error('❌ Error deleting user:', deleteError);
  } else {
    console.log('✅ User deleted successfully!');
  }
}

// Run the deletion
const emailToDelete = 'miguel-angel.sanchez-marti@lht.dlh.de';
deleteUser(emailToDelete);
