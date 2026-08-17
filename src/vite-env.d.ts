/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_BUILD_TIME__: string;
declare const __APP_BUILD_ID__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_DHCHAT_URL?: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}