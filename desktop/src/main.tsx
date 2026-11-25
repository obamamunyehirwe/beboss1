import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./lib/desktop";
import "./styles.css";
import "./setup.css";
import "./command.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
