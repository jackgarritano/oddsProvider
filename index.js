import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }

const supabase = createClient(process.env.API_URL, process.env.SERVICE_ROLE_KEY, options);

const {data, error} = await supabase
    .from('matches')
    .select();

console.log('data ', data);
console.log('error ', error);

/* 
All competitions that are not in the db need to be added to the db
All competitions that are not yet resulted or cancelled need to be polled w/ events endpt
All competitions that are resulted need to get scores pulled
*/