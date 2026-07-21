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
  url: "https://xoqkmaeizhgjgrktktjf.supabase.co",
  anonKey: "sb_publishable_QRpPwXj2V-ROceoR8fXYgg_5K9pvlbF",
};

// ---- Platform settings ----
export const platformName = "letsplay";
export const defaultBubbleColor = "#3b8df0";

// ---- Channels (loaded from DB at runtime, this is the fallback) ----
export const channels = [];
