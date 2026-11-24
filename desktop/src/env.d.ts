/// <reference types="vite/client" />

interface Window {
  beBossDesktop: {
    secureStore: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string): Promise<boolean>;
      remove(key: string): Promise<boolean>;
    };
    getDeviceId(): Promise<string>;
    openExternal(url: string): Promise<boolean>;
    platform: string;
    version: string;
  };
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}
