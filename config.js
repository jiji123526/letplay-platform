// ============================================================
//  Platform Configuration
// ============================================================

// ---- BACKEND SELECTION ----
// "supabase" | "mock"
export const BACKEND = "supabase";

// ---- LOCAL DEV MODE ----
export const USE_MOCK = false;

// ---- Supabase Config ----
export const supabaseConfig = {
  url: "YOUR_SUPABASE_URL",
  anonKey: "YOUR_SUPABASE_ANON_KEY",
};

// ---- Platform settings ----
export const platformName = "letsplay";
export const defaultBubbleColor = "#3b8df0";
