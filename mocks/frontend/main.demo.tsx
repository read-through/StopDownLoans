import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../../frontend/src/App";
import "../../frontend/src/styles.css";
import { installMockWallet } from "./installMockWallet";

installMockWallet();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
