// Supabase project credentials — fill these in to enable accounts + cloud sync.
// Both values are safe to commit: the anon key is public by design; row-level
// security in the database is what protects each user's data.
//
// Get them from: supabase.com dashboard -> your project -> Settings -> API
//   url:     "Project URL"       (https://xxxx.supabase.co)
//   anonKey: "anon public" key
//
// Leave empty and the app runs in local-only mode, same as before.

window.SUPABASE_CONFIG = {
  url: "",
  anonKey: "",
};
