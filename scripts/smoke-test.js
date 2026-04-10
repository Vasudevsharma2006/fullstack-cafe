const { spawn } = require("child_process");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
  const port = 4010;
  const child = spawn("node", ["app.js"], {
    env: { ...process.env, PORT: String(port), NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let started = false;
  child.stdout.on("data", (data) => {
    const text = data.toString();
    if (text.includes(`http://localhost:${port}`)) {
      started = true;
    }
  });
  child.stderr.on("data", (data) => {
    process.stderr.write(data.toString());
  });

  try {
    for (let i = 0; i < 25; i += 1) {
      if (started) break;
      await wait(200);
    }
    if (!started) {
      throw new Error("Server did not start in time.");
    }

    const health = await fetch(`http://localhost:${port}/healthz`);
    if (!health.ok) throw new Error("Health endpoint failed.");
    const menu = await fetch(`http://localhost:${port}/api/menu`);
    if (!menu.ok) throw new Error("Menu API endpoint failed.");

    const healthJson = await health.json();
    const menuJson = await menu.json();
    if (!healthJson.status || !Array.isArray(menuJson.items)) {
      throw new Error("Response schema validation failed.");
    }

    console.log("Smoke test passed.");
  } finally {
    child.kill();
  }
};

run().catch((err) => {
  console.error("Smoke test failed:", err.message);
  process.exitCode = 1;
});
