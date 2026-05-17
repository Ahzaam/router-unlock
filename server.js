const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const next = require("next");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const mime = require("mime-types");
const { createAdapter } = require("@socket.io/redis-adapter");
const Redis = require("ioredis");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const SESSION_TTL_SECONDS = 30 * 60;
const proxyRequests = new Map();

function resolveRedisUrl() {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  const restUrl = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!restUrl || !token) {
    throw new Error("Missing REDIS_URL or Upstash Redis environment variables");
  }

  const parsed = new URL(restUrl);
  const host = parsed.hostname;
  const port = parsed.port || "6379";
  return `rediss://default:${encodeURIComponent(token)}@${host}:${port}`;
}

async function getSession(code, pubClient) {
  const data = await pubClient.get(`session:${code}`);
  return data ? JSON.parse(data) : null;
}

async function saveSession(session, pubClient) {
  await pubClient.set(`session:${session.code}`, JSON.stringify(session), {
    EX: SESSION_TTL_SECONDS,
  });
  await pubClient.sadd("active-sessions", session.code);
}

async function deleteSession(code, pubClient) {
  await pubClient.del(`session:${code}`);
  await pubClient.srem("active-sessions", code);
}

async function getAllSessions(pubClient) {
  const codes = await pubClient.smembers("active-sessions");
  const sessions = await Promise.all(
    codes.map(async (code) => {
      const session = await getSession(code, pubClient);
      if (!session) {
        await pubClient.srem("active-sessions", code);
      }
      return session;
    }),
  );
  return sessions.filter(Boolean);
}

async function createOrUpdateSession(code, values, pubClient) {
  const existing = (await getSession(code, pubClient)) || {
    code,
    name: "Unnamed Session",
    adminId: null,
    routerId: null,
    agentId: null,
    createdAt: Date.now(),
  };

  const session = {
    ...existing,
    ...values,
    code,
    createdAt: existing.createdAt || Date.now(),
  };

  await saveSession(session, pubClient);
  return session;
}

// Configure storage for uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const code = req.params.code;
    const dir = path.join(__dirname, "uploads", code);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

app.prepare().then(async () => {
  const server = express();
  server.use(express.json({ limit: "500mb" }));
  server.use(express.urlencoded({ limit: "500mb", extended: true }));
  const httpServer = createServer(server);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    pingInterval: 5000, // Send ping every 5 seconds (default 25s)
    pingTimeout: 10000, // Wait 10 seconds for pong before considering socket dead (default 60s)
  });

  const redisUrl = resolveRedisUrl();

  const pubClient = new Redis(redisUrl, { lazyConnect: true });
  const subClient = new Redis(redisUrl, { lazyConnect: true });

  pubClient.on("error", (err) => console.error("Redis pub client error:", err));
  subClient.on("error", (err) => console.error("Redis sub client error:", err));

  try {
    await pubClient.connect();
    await subClient.connect();
  } catch (err) {
    console.error("Failed to connect to Redis:", err);
    process.exit(1);
  }

  io.adapter(createAdapter(pubClient, subClient));

  server.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // File Upload Endpoint
  server.post("/upload/:code", upload.single("file"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    console.log(`File uploaded for session ${req.params.code}: ${req.file.filename}`);
    io.to(req.params.code).emit("file-uploaded", { filename: req.file.filename });
    res.json({ status: "ok", filename: req.file.filename });
  });

  // List Files Endpoint
  server.get("/files/:code", (req, res) => {
    const code = req.params.code;
    const dir = path.join(__dirname, "uploads", code);
    if (!fs.existsSync(dir)) {
      return res.json([]);
    }
    const files = fs.readdirSync(dir);
    res.json(files);
  });

  // Download File Endpoint
  server.get("/download/:code/:filename", (req, res) => {
    const { code, filename } = req.params;
    const filePath = path.join(__dirname, "uploads", code, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found");
    }
    res.download(filePath);
  });

  // Admin to Agent Upload Endpoint
  server.post("/admin-upload/:code", upload.single("file"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const { code } = req.params;
    const downloadUrl = `${req.protocol}://${req.get("host")}/download/${code}/${req.file.filename}`;

    // Notify agent to download this file
    io.to(code).emit("download-file", {
      url: downloadUrl,
      filename: req.file.filename,
    });

    res.json({ status: "ok", filename: req.file.filename });
  });

  // HTTP Proxy Bridge - Sticky Target Implementation
  // Structure: /api/proxy/:code/ (any path)
  server.get(/^\/api\/proxy\/([^/]+)\/(.*)/, async (req, res) => {
    const code = req.params[0];
    const fullPath = req.params[1];
    const parts = fullPath.split("/");
    let targetInfo = parts[0];
    let path = parts.slice(1).join("/");

    // Check if targetInfo looks like an IP (e.g. 192.168.1.1 or 192.168.1.1:80)
    const isTarget = /^(\d{1,3}\.){3}\d{1,3}/.test(targetInfo);
    const session = await getSession(code, pubClient);

    if (isTarget) {
      // Store this as the "sticky" target for this session
      if (session) {
        session.lastProxyTarget = targetInfo;
        await saveSession(session, pubClient);
      }
    } else {
      // Not a target, try to recover from session
      if (session && session.lastProxyTarget) {
        targetInfo = session.lastProxyTarget;
        path = fullPath; // In this case, the entire captured path is the actual subpath
      } else {
        return res.status(404).send("Proxy target not found and no active session.");
      }
    }

    const requestId = Math.random().toString(36).substring(7);
    let [ip, port] = targetInfo.split(":");
    if (!port) port = "80";

    let target = `http://${ip}:${port}/${path}`;
    const queryParams = new URLSearchParams(req.query).toString();
    if (queryParams) target += "?" + queryParams;

    console.log(`Proxy request for ${target} (ID: ${requestId})`);

    const timeout = setTimeout(() => {
      if (proxyRequests.has(requestId)) {
        proxyRequests.delete(requestId);
        res.status(504).send("Gateway Timeout");
      }
    }, 15000);

    proxyRequests.set(requestId, { res, timeout, code, targetInfo });

    const room = io.sockets.adapter.rooms.get(code);
    console.log(`Proxy request for ${target} (ID: ${requestId}) - Room ${code} members: ${room ? room.size : 0}`);

    io.to(code).emit("proxy-request", {
      requestId,
      target,
      method: req.method,
    });
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    // Send heartbeat to keep connection alive (especially for Cloud Run)
    const heartbeatInterval = setInterval(
      () => {
        socket.emit("heartbeat", { timestamp: Date.now() });
      },
      4 * 60 * 1000,
    ); // Send every 4 minutes (well before Cloud Run's 15min timeout)

    // Attach interval to socket object so we can clear it on disconnect
    socket.heartbeatInterval = heartbeatInterval;

    // Create session (Legacy/Optional)
    socket.on("create-session", async () => {
      let code;
      let session;
      do {
        code = Math.floor(100000 + Math.random() * 900000).toString();
        session = await getSession(code, pubClient);
      } while (session);

      await createOrUpdateSession(
        code,
        {
          name: "Unnamed Session",
          adminId: socket.id,
          routerId: null,
          agentId: null,
          createdAt: Date.now(),
        },
        pubClient,
      );

      socket.join(code);
      socket.emit("session-created", code);
      io.emit("sessions-updated", await getAllSessions(pubClient));
    });

    // Agent create session
    socket.on("agent-create-session", async ({ code, name }) => {
      await createOrUpdateSession(
        code,
        {
          name: name || "Unnamed Session",
          adminId: null,
          routerId: null,
          agentId: socket.id,
          createdAt: Date.now(),
        },
        pubClient,
      );
      socket.join(code);
      io.to(code).emit("agent-connected", { id: socket.id });
      io.emit("sessions-updated", await getAllSessions(pubClient));
    });

    // Get all sessions
    socket.on("get-sessions", async () => {
      socket.emit("sessions-updated", await getAllSessions(pubClient));
    });

    // Join session
    socket.on("join-session", async ({ code, role }) => {
      const session = await getSession(code, pubClient);
      if (!session) {
        return socket.emit("error", "Session not found");
      }

      if (role === "admin") session.adminId = socket.id;
      if (role === "router") session.routerId = socket.id;

      await saveSession(session, pubClient);
      socket.join(code);

      // Sync current status to the joiner
      socket.emit("session-status", {
        adminConnected: !!session.adminId,
        agentConnected: !!session.agentId,
        routerConnected: !!session.routerId,
      });

      // Broadcast user-connected
      io.to(code).emit("user-connected", { role, id: socket.id, code });
      io.emit("sessions-updated", await getAllSessions(pubClient));
    });

    // Agent connected
    socket.on("agent-connected", async (code) => {
      const session = await getSession(code, pubClient);
      if (session) {
        session.agentId = socket.id;
        await saveSession(session, pubClient);
        socket.join(code);
        io.to(code).emit("agent-connected", { id: socket.id, code });
        io.emit("sessions-updated", await getAllSessions(pubClient));
      }
    });

    // Send command
    socket.on("send-command", async ({ code, type, command }) => {
      const session = await getSession(code, pubClient);
      if (!session) return;

      if (type === "AT") {
        // Tell router to run via Serial
        io.to(code).emit("serial-command", { command });
      } else if (type === "CMD") {
        // Tell agent to execute CMD
        io.to(code).emit("execute-command", { command });
      }
    });

    socket.on("request-upload", ({ code, path }) => {
      io.to(code).emit("request-upload", { path });
    });

    socket.on("network-scan", ({ code }) => {
      console.log(`Admin requested network scan for session: ${code}`);
      io.to(code).emit("network-scan", {});
    });

    socket.on("network-scan-result", ({ code, devices }) => {
      console.log(`Received scan results for ${code}: Found ${devices.length} devices`);
      io.to(code).emit("network-scan-result", { code, devices });
    });

    socket.on("proxy-response", (data) => {
      const { requestId, status, headers, content, error } = data;
      const pending = proxyRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        proxyRequests.delete(requestId);

        const { res, code, targetInfo } = pending;

        if (error) {
          console.error(`Proxy Error for ID ${requestId}:`, error);
          return res.status(502).send(`Proxy Error: ${error}`);
        }

        // Set headers (filtering some out to avoid conflicts)
        if (headers) {
          Object.keys(headers).forEach((key) => {
            const lowerKey = key.toLowerCase();
            if (
              !["content-encoding", "transfer-encoding", "content-length", "connection", "x-content-type-options"].includes(
                lowerKey,
              )
            ) {
              res.set(key, headers[key]);
            }
          });
        }

        // Force correct MIME type based on extension if router is being weird
        const targetUrl = res.req.url;
        const ext = path.extname(targetUrl.split("?")[0]);
        if (ext) {
          const type = mime.lookup(ext);
          if (type) {
            res.set("Content-Type", type);
          }
        }

        // Relax security for proxied content to ensure it loads
        res.set("X-Content-Type-Options", "none");
        res.set("Access-Control-Allow-Origin", "*");

        const buffer = Buffer.from(content, "base64");
        let finalContent = buffer;

        // If it's HTML, inject a <base> tag to fix relative links and redirects
        const contentType = res.get("Content-Type") || "";
        if (contentType.includes("text/html")) {
          let html = buffer.toString("utf-8");
          const baseTag = `<base href="/api/proxy/${code}/${targetInfo}/">`;

          if (html.includes("<head>")) {
            html = html.replace("<head>", `<head>${baseTag}`);
          } else if (html.includes("<html>")) {
            html = html.replace("<html>", `<html><head>${baseTag}</head>`);
          } else {
            html = baseTag + html;
          }
          finalContent = Buffer.from(html, "utf-8");
        }

        res.status(status || 200).send(finalContent);
      }
    });

    // Video Call Events
    socket.on("call-request", ({ code }) => {
      console.log(`Call requested for session: ${code}`);
      socket.to(code).emit("call-request", { code, from: socket.id });
    });

    socket.on("call-accept", ({ code }) => {
      console.log(`Call accepted for session: ${code}`);
      io.to(code).emit("call-accept", { code, from: socket.id });
    });

    socket.on("call-decline", ({ code }) => {
      console.log(`Call declined for session: ${code}`);
      io.to(code).emit("call-decline", { code, from: socket.id });
    });

    // Command result
    socket.on("command-result", ({ code, output }) => {
      io.to(code).emit("command-result", { code, output }); // send code back too
    });

    // Disconnect
    socket.on("disconnect", async () => {
      console.log("Client disconnected:", socket.id);

      // Clear heartbeat interval
      if (socket.heartbeatInterval) {
        clearInterval(socket.heartbeatInterval);
      }

      const sessions = await getAllSessions(pubClient);
      let stateChanged = false;

      for (const session of sessions) {
        let role = null;
        if (session.adminId === socket.id) {
          session.adminId = null;
          role = "admin";
        } else if (session.routerId === socket.id) {
          session.routerId = null;
          role = "router";
        } else if (session.agentId === socket.id) {
          session.agentId = null;
          role = "agent";
        }

        if (!role) continue;

        stateChanged = true;
        io.to(session.code).emit("user-disconnected", { role });

        if (!session.adminId && !session.routerId && !session.agentId) {
          await deleteSession(session.code, pubClient);
        } else {
          await saveSession(session, pubClient);
        }
      }

      if (stateChanged) {
        io.emit("sessions-updated", await getAllSessions(pubClient));
      }
    });
  });

  // Handle all other requests with Next.js
  server.use((req, res) => {
    return handle(req, res);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down gracefully");
    httpServer.close(() => {
      process.exit(0);
    });
  });

  httpServer.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
