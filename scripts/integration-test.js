const { spawn } = require("child_process");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const extractCookie = (headers) => {
  const setCookie = headers.get("set-cookie");
  if (!setCookie) return "";
  return setCookie.split(";")[0];
};

const run = async () => {
  const port = 4011;
  const child = spawn("node", ["app.js"], {
    env: { ...process.env, PORT: String(port), NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let started = false;
  child.stdout.on("data", (data) => {
    if (data.toString().includes(`http://localhost:${port}`)) {
      started = true;
    }
  });
  child.stderr.on("data", (data) => process.stderr.write(data.toString()));

  try {
    for (let i = 0; i < 30; i += 1) {
      if (started) break;
      await wait(200);
    }
    if (!started) throw new Error("Server did not start in time.");

    const signupUsername = `user_${Date.now()}`;
    const signupBody = new URLSearchParams({
      username: signupUsername,
      email: `${signupUsername}@example.com`,
      password: "Secret123!",
      confirmPassword: "Secret123!",
    });
    const signupResponse = await fetch(`http://localhost:${port}/signup`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: signupBody.toString(),
      redirect: "manual",
    });
    if (signupResponse.status < 300 || signupResponse.status >= 400) {
      throw new Error("Signup flow failed.");
    }

    const loginBody = new URLSearchParams({
      username: signupUsername,
      password: "Secret123!",
    });
    const loginResponse = await fetch(`http://localhost:${port}/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: loginBody.toString(),
      redirect: "manual",
    });
    if (loginResponse.status < 300 || loginResponse.status >= 400) {
      throw new Error("Login flow failed.");
    }
    const cookie = extractCookie(loginResponse.headers);
    if (!cookie) throw new Error("Session cookie missing after login.");

    const dashboard = await fetch(`http://localhost:${port}/dashboard`, {
      headers: { cookie },
    });
    if (!dashboard.ok) throw new Error("Authenticated dashboard request failed.");

    const contactBody = new URLSearchParams({
      name: "Integration Test",
      email: "integration@example.com",
      subject: "Test",
      message: "Contact route integration test",
    });
    const contactResponse = await fetch(`http://localhost:${port}/contact`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: `http://localhost:${port}`,
      },
      body: contactBody.toString(),
      redirect: "manual",
    });
    if (contactResponse.status < 300 || contactResponse.status >= 400) {
      throw new Error("Contact form route failed.");
    }

    const apiMenu = await fetch(`http://localhost:${port}/api/menu?sort=price_asc`);
    if (!apiMenu.ok) throw new Error("Menu API request failed.");
    const menuPayload = await apiMenu.json();
    if (!Array.isArray(menuPayload.items) || menuPayload.items.length === 0) {
      throw new Error("Menu API payload invalid.");
    }

    console.log("Integration test passed.");
  } finally {
    child.kill();
  }
};

run().catch((err) => {
  console.error("Integration test failed:", err.message);
  process.exitCode = 1;
});
