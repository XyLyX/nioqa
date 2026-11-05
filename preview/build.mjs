import { copyFile, mkdir, writeFile } from "node:fs/promises";

const output = new URL("../dist/", import.meta.url);
await mkdir(output, { recursive: true });
const assets = [
  ["index.html", "./index.html"],
  ["signup.css", "./signup.css"],
  ["signup.js", "./signup.js"],
  ["sign-in.js", "../src/auth/sign-in.js"],
  ["supabase.js", "../node_modules/@supabase/supabase-js/dist/umd/supabase.js"]
];
await Promise.all(assets.map(([name, source]) =>
  copyFile(new URL(source, import.meta.url), new URL(name, output))
));
await writeFile(new URL("_redirects", output), "/auth/callback /index.html 200\n");
await writeFile(new URL("_headers", output), "/*\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n");
