import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// 1. Bind immediately to satisfy Cloud Run health check
// This ensures the container is "ready" as soon as possible.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});

// --- Lazy Initialization Helpers ---

let cachedCredentials: any = null;

function getCredentials() {
  if (cachedCredentials) return cachedCredentials;

  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  let privateKey = rawKey?.trim();
  let clientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  let projectId = process.env.GOOGLE_PROJECT_ID?.trim();

  function tryParseJson(str: string | undefined) {
    if (!str) return null;
    const cleaned = str.trim().replace(/^["']|["']$/g, '').trim();
    if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
      try {
        return JSON.parse(cleaned);
      } catch {
        return null;
      }
    }
    return null;
  }

  const keyJson = tryParseJson(privateKey);
  const emailJson = tryParseJson(clientEmail);
  const finalJson = keyJson || emailJson;

  if (finalJson) {
    if (finalJson.private_key) privateKey = finalJson.private_key;
    if (finalJson.client_email) clientEmail = finalJson.client_email;
    if (finalJson.project_id) projectId = finalJson.project_id;
  }

  function cleanCredential(val: string | undefined): string | undefined {
    if (!val) return val;
    let cleaned = val.trim();
    const prefixMatch = cleaned.match(/^(?:export\s+)?(?:GOOGLE_[A-Z_]+|client_email|project_id|private_key)\s*[=:]\s*/i);
    if (prefixMatch) {
      cleaned = cleaned.substring(prefixMatch[0].length).trim();
    }
    while (cleaned.startsWith('"') || cleaned.startsWith("'") || cleaned.endsWith('"') || cleaned.endsWith("'")) {
      cleaned = cleaned.replace(/^["']|["']$/g, '').trim();
    }
    cleaned = cleaned.replace(/[,}"']+$/, '').replace(/^["'{,]+/, '').trim();
    return cleaned;
  }

  privateKey = cleanCredential(privateKey);
  clientEmail = cleanCredential(clientEmail);
  projectId = cleanCredential(projectId);

  if (privateKey) {
    while (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
    while (privateKey.includes('\\r')) privateKey = privateKey.replace(/\\r/g, '\r');
    while (privateKey.includes('\\t')) privateKey = privateKey.replace(/\\t/g, '\t');
    
    const isRsa = privateKey.includes('RSA PRIVATE KEY');
    const HEADER = isRsa ? '-----BEGIN RSA PRIVATE KEY-----' : '-----BEGIN PRIVATE KEY-----';
    const FOOTER = isRsa ? '-----END RSA PRIVATE KEY-----' : '-----END PRIVATE KEY-----';
    
    let core = privateKey;
    if (privateKey.includes(HEADER)) core = privateKey.split(HEADER)[1];
    if (core.includes(FOOTER)) core = core.split(FOOTER)[0];
    core = core.replace(/[^A-Za-z0-9+/=]/g, '');
    const lines = core.match(/.{1,64}/g);
    const wrappedCore = lines ? lines.join('\n') : core;
    privateKey = `${HEADER}\n${wrappedCore}\n${FOOTER}\n`;
  }

  cachedCredentials = { privateKey, clientEmail, projectId };
  return cachedCredentials;
}

let sheetsInstance: any = null;

function getSheets() {
  if (sheetsInstance) return sheetsInstance;

  const { privateKey, clientEmail, projectId } = getCredentials();
  if (!privateKey || !clientEmail) {
    throw new Error("Google Sheets credentials not configured");
  }

  const auth = new google.auth.GoogleAuth({
    projectId: projectId,
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
      project_id: projectId,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsInstance = google.sheets({ version: "v4", auth });
  return sheetsInstance;
}

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

async function getSheetData(range: string) {
  if (!SPREADSHEET_ID) throw new Error("GOOGLE_SHEET_ID missing");
  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  return response.data.values;
}

// --- Email Transporter ---

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;

  let host = process.env.EMAIL_HOST;
  const port = parseInt(process.env.EMAIL_PORT || "587");
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (host && host.toLowerCase().startsWith('smpt.')) {
    host = 'smtp.' + host.substring(5);
  }

  if (host && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return transporter;
}

// --- API Routes ---

app.get("/api/config-check", (req, res) => {
  const { clientEmail, privateKey, projectId } = getCredentials();
  res.json({
    sheetId: !!SPREADSHEET_ID,
    clientEmail: !!clientEmail,
    privateKey: !!privateKey,
    projectId: !!projectId,
    env: process.env.NODE_ENV
  });
});

app.get("/api/classes", async (req, res) => {
  try {
    const rows = await getSheetData("Classes!A:I");
    if (!rows || rows.length <= 1) return res.json([]);
    const data = rows.slice(1).map((row, index) => ({
      id: index + 2,
      name: row[0] || "",
      description: row[1] || "",
      date: row[2] || "",
      time: row[3] || "",
      location: row[4] || "",
      type: row[5] || "In-Person",
      instructor: row[6] || "",
      available_seats: row[7] || 0,
      webAddress: row[8] || ""
    }));
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { classId, className, classDate, classTime, classType, agentName, email, phone, marketCenter, webAddress } = req.body;
    if (!SPREADSHEET_ID) throw new Error("GOOGLE_SHEET_ID not configured");
    
    const sheets = getSheets();
    const registrationValues = [new Date().toISOString(), className, classDate, classTime, agentName, email, phone, marketCenter];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Registrations!A:H",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [registrationValues] },
    });

    // Update seats logic...
    const rows = await getSheetData(`Classes!A${classId}:H${classId}`);
    if (rows && rows[0]) {
      const currentSeats = parseInt(rows[0][7]) || 0;
      if (currentSeats > 0 && rows[0][5]?.toLowerCase() !== 'self-paced') {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `Classes!H${classId}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[currentSeats - 1]] },
        });
      }
    }

    // Email...
    const mailTransporter = getTransporter();
    if (mailTransporter) {
      await mailTransporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: `Registration Confirmation: ${className}`,
        html: `<p>Hello ${agentName}, your registration for ${className} is confirmed.</p>`
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/login", (req, res) => {
  if (req.body.password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Invalid password" });
  }
});

// --- Vite / Static Files ---

if (process.env.NODE_ENV !== "production") {
  createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  }).then((vite) => {
    app.use(vite.middlewares);
  });
} else {
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
