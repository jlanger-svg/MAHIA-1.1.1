import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      "https://dhgtmzfdpwjidjgucuyc.supabase.co",
    ),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
      "sb_publishable_0BGvattoGjgUGmRQFgSd9Q_qG8RlZvu",
    ),
  },
});
