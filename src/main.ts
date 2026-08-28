import "./styles/reset.css";
import "./styles/tokens.css";
import "./styles/global.css";

import { bootApp } from "./app/app.ts";

const app = document.querySelector<HTMLDivElement>("#app");

if (app === null) {
  throw new Error("Missing #app mount element");
}

bootApp(app);
