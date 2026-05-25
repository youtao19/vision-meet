import { createApp } from "./app.js";
import { appEnv } from "./shared/config/env.js";

const app = createApp();

app.listen(appEnv.PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[backend] express server is running on http://127.0.0.1:${appEnv.PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[backend] agent dir: ${appEnv.AGENT_PI_DIR}`);
});
