import { startServer } from "./src/server";

const server = startServer();
console.log(`Tribute Pay webhook listening on http://localhost:${server.port}`);
