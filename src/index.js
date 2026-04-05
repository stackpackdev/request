import express from "express";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const PORT = parseInt(process.env.PORT ?? "3003", 10);

const app = express();
app.use(express.json());

// ── API: list tickets ─────────────────────────────────────────────────
app.get("/api/tickets", async (_req, res) => {
  const status = _req.query.status ?? "open";
  const result = await pool.query(
    `SELECT tr.id, tr.user_intent, tr.agent_context, tr.suggested_tool,
            tr.error_log, tr.status, tr.priority, tr.admin_note,
            tr.created_at, tr.updated_at,
            u.email as user_email,
            p.slug as project_slug
     FROM tool_requests tr
     LEFT JOIN users u ON tr.user_id = u.id
     LEFT JOIN projects p ON tr.project_id = p.id
     ORDER BY tr.created_at DESC
     LIMIT 100`,
  );
  res.json({ tickets: result.rows });
});

// ── API: get single ticket ────────────────────────────────────────────
app.get("/api/tickets/:id", async (req, res) => {
  const result = await pool.query(
    `SELECT tr.*, u.email as user_email, p.slug as project_slug
     FROM tool_requests tr
     LEFT JOIN users u ON tr.user_id = u.id
     LEFT JOIN projects p ON tr.project_id = p.id
     WHERE tr.id = $1`,
    [req.params.id],
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ticket: result.rows[0] });
});

// ── API: update ticket status ─────────────────────────────────────────
app.post("/api/tickets/:id", async (req, res) => {
  const { status, priority, admin_note } = req.body;
  const sets = [];
  const vals = [];
  let i = 1;

  if (status) { sets.push(`status = $${i++}`); vals.push(status); }
  if (priority) { sets.push(`priority = $${i++}`); vals.push(priority); }
  if (admin_note !== undefined) { sets.push(`admin_note = $${i++}`); vals.push(admin_note); }
  sets.push(`updated_at = now()`);

  if (sets.length === 1) return res.status(400).json({ error: "Nothing to update" });

  vals.push(req.params.id);
  await pool.query(
    `UPDATE tool_requests SET ${sets.join(", ")} WHERE id = $${i}`,
    vals,
  );
  res.json({ ok: true });
});

// ── API: stats ────────────────────────────────────────────────────────
app.get("/api/stats", async (_req, res) => {
  const result = await pool.query(
    `SELECT status, COUNT(*) as count FROM tool_requests GROUP BY status ORDER BY count DESC`,
  );
  const topTools = await pool.query(
    `SELECT suggested_tool, COUNT(*) as count
     FROM tool_requests WHERE suggested_tool IS NOT NULL
     GROUP BY suggested_tool ORDER BY count DESC LIMIT 10`,
  );
  res.json({
    by_status: result.rows,
    top_requested_tools: topTools.rows,
  });
});

// ── Health ─────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", service: "request" }));

// ── Dashboard UI ──────────────────────────────────────────────────────
app.get("/", async (_req, res) => {
  let tickets = [];
  let stats = { by_status: [], top_requested_tools: [] };
  try {
    const ticketResult = await pool.query(
      `SELECT tr.id, tr.user_intent, tr.suggested_tool, tr.status, tr.priority,
              tr.admin_note, tr.created_at, u.email as user_email, p.slug as project_slug
       FROM tool_requests tr
       LEFT JOIN users u ON tr.user_id = u.id
       LEFT JOIN projects p ON tr.project_id = p.id
       ORDER BY tr.created_at DESC LIMIT 50`,
    );
    tickets = ticketResult.rows;

    const statsResult = await pool.query(
      `SELECT status, COUNT(*) as count FROM tool_requests GROUP BY status`,
    );
    stats.by_status = statsResult.rows;

    const topResult = await pool.query(
      `SELECT suggested_tool, COUNT(*) as count
       FROM tool_requests WHERE suggested_tool IS NOT NULL
       GROUP BY suggested_tool ORDER BY count DESC LIMIT 5`,
    );
    stats.top_requested_tools = topResult.rows;
  } catch (err) {
    console.error("[request] DB error:", err.message);
  }

  const statusColors = {
    open: "bg-amber-500/20 text-amber-300",
    acknowledged: "bg-blue-500/20 text-blue-300",
    building: "bg-purple-500/20 text-purple-300",
    shipped: "bg-green-500/20 text-green-300",
    wont_fix: "bg-gray-500/20 text-gray-400",
  };

  const priorityColors = {
    critical: "text-red-400",
    high: "text-orange-400",
    normal: "text-gray-300",
    low: "text-gray-500",
  };

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>StackPack Requests</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-950 text-white min-h-screen">
  <div class="max-w-5xl mx-auto px-6 py-8">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold">Tool Requests</h1>
        <p class="text-sm text-gray-500 mt-1">Capabilities agents need but don't have yet</p>
      </div>
      <div class="flex gap-4 text-sm">
        ${stats.by_status.map((s) => `<div class="text-center">
          <div class="text-lg font-semibold ${s.status === "open" ? "text-amber-400" : "text-gray-400"}">${s.count}</div>
          <div class="text-gray-500">${s.status}</div>
        </div>`).join("")}
      </div>
    </div>

    ${stats.top_requested_tools.length > 0 ? `
    <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6">
      <h3 class="text-sm font-medium text-gray-400 mb-2">Most requested tools</h3>
      <div class="flex flex-wrap gap-2">
        ${stats.top_requested_tools.map((t) => `<span class="px-2 py-1 bg-gray-800 rounded text-sm text-gray-300">${t.suggested_tool} <span class="text-gray-500">(${t.count})</span></span>`).join("")}
      </div>
    </div>` : ""}

    ${tickets.length === 0
      ? `<div class="text-center py-16 text-gray-500">No requests yet. Agents will submit tickets when they can't solve a user's task.</div>`
      : `<div class="space-y-3">
      ${tickets.map((t) => `
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs font-mono text-gray-600">#${t.id}</span>
                <span class="px-1.5 py-0.5 rounded text-xs ${statusColors[t.status] || "bg-gray-700 text-gray-300"}">${t.status}</span>
                ${t.suggested_tool ? `<span class="px-1.5 py-0.5 bg-gray-800 rounded text-xs text-gray-400">${t.suggested_tool}</span>` : ""}
                <span class="text-xs ${priorityColors[t.priority] || "text-gray-500"}">${t.priority}</span>
              </div>
              <p class="text-sm text-gray-200 mb-1">${t.user_intent}</p>
              <div class="text-xs text-gray-500">
                ${t.user_email || "unknown user"}${t.project_slug ? ` · ${t.project_slug}` : ""} · ${new Date(t.created_at).toLocaleDateString()}
              </div>
              ${t.admin_note ? `<div class="mt-2 text-xs text-gray-400 bg-gray-800/50 rounded px-2 py-1">Admin: ${t.admin_note}</div>` : ""}
            </div>
          </div>
        </div>`).join("")}
    </div>`}
  </div>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`[request] Listening on port ${PORT}`);
});
