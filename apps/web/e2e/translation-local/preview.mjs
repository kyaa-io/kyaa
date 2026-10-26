import { createTranslationFixtureServer } from "./server.mjs";
const server = await createTranslationFixtureServer();
await server.listen();
console.log("Synthetic translation preview: http://127.0.0.1:4217/?locale=ru");
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void server.close().then(() => process.exit(0)); });
