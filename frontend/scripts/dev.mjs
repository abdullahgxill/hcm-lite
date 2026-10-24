import { createServer } from "vite";
const args = process.argv.slice(2),
  index = args.indexOf("--port");
const server = await createServer({
  server: {
    host: args.includes("--host")
      ? args[args.indexOf("--host") + 1]
      : "127.0.0.1",
    port: index >= 0 ? Number(args[index + 1]) : 5173,
    strictPort: true,
  },
});
await server.listen();
server.printUrls();
