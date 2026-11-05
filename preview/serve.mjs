import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const files = new Map([
  ["/", ["index.html", "text/html"]],
  ["/auth/callback", ["index.html", "text/html"]],
  ["/signup.js", ["signup.js", "text/javascript"]],
  ["/signup.css", ["signup.css", "text/css"]],
  ["/sign-in.js", ["../src/auth/sign-in.js", "text/javascript"]],
  ["/supabase.js", ["../node_modules/@supabase/supabase-js/dist/umd/supabase.js", "text/javascript"]]
]);
const host = "127.0.0.1";
const port = 4173;
export const server = createServer(async (request, response) => {
  const route = files.get(request.url.split("?")[0]);
  if (request.headers.host !== `${host}:${port}` || request.method !== "GET" || !route) {
    response.writeHead(404).end();
    return;
  }
  const [file, type] = route;
  try {
    const body = await readFile(new URL(file, import.meta.url));
    response.writeHead(200, {
      "Content-Type": `${type}; charset=utf-8`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer"
    }).end(body);
  } catch {
    response.writeHead(500).end("Preview file unavailable. Run npm ci first.");
  }
}).listen(port, host, () => console.log(`NIOQA preview at http://${host}:${port}/`));
