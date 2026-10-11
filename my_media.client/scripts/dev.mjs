import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverProject = path.resolve(clientRoot, "..", "my_media.Server", "Pulse.Server.csproj");

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}

const startedByServer = String(process.env.ASPNETCORE_HOSTINGSTARTUPASSEMBLIES || "").includes("SpaProxy");
if (!startedByServer && !(await portOpen(5017))) {
  const api = spawn(
    "dotnet",
    ["run", "--project", serverProject, "--no-launch-profile"],
    {
      cwd: clientRoot,
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        ASPNETCORE_ENVIRONMENT: "Development",
        ASPNETCORE_URLS: "http://localhost:5017",
      },
    }
  );
  api.on("exit", (code) => {
    if (code) process.exit(code);
  });
}

const vite = spawn("npx", ["vite"], {
  cwd: clientRoot,
  stdio: "inherit",
  shell: true,
});

vite.on("exit", (code) => process.exit(code ?? 0));
