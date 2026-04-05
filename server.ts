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

// --- Startup Check ---
console.log("--- Environment Variable Check ---");
console.log("GOOGLE_SHEET_ID:", process.env.GOOGLE_SHEET_ID ? "Present" : "MISSING");
console.log("GOOGLE_CLIENT_EMAIL:", process.env.GOOGLE_CLIENT_EMAIL ? "Present" : "MISSING");
console.log("GOOGLE_PRIVATE_KEY:", process.env.GOOGLE_PRIVATE_KEY ? "Present (Length: " + process.env.GOOGLE_PRIVATE_KEY.length + ")" : "MISSING");
console.log("GOOGLE_PROJECT_ID:", process.env.GOOGLE_PROJECT_ID ? "Present" : "MISSING (Optional if in JSON)");
console.log("ADMIN_PASSWORD:", process.env.ADMIN_PASSWORD ? "Present" : "MISSING");
console.log("----------------------------------");

// 1. Bind immediately to satisfy Cloud Run health check
// This ensures the container is "ready" as soon as possible.
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
});

// --- Lazy Initialization Helpers ---

let cachedCredentials: any = null;

function getCredentials() {
  if (cachedCredentials) return cachedCredentials;

  let privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").trim();
  let clientEmail = (process.env.GOOGLE_CLIENT_EMAIL || "").trim();
  let projectId = (process.env.GOOGLE_PROJECT_ID || "").trim();
  const sheetId = (process.env.GOOGLE_SHEET_ID || "").trim();

  // 1. Strip surrounding quotes if present
  privateKey = privateKey.replace(/^["']|["']$/g, '');
  clientEmail = clientEmail.replace(/^["']|["']$/g, '');
  projectId = projectId.replace(/^["']|["']$/g, '');

  // 2. Handle case where the entire JSON was pasted into GOOGLE_PRIVATE_KEY
  if (privateKey.startsWith('{')) {
    try {
      const json = JSON.parse(privateKey);
      if (json.private_key) privateKey = json.private_key;
      if (json.client_email && !clientEmail) clientEmail = json.client_email;
      if (json.project_id && !projectId) projectId = json.project_id;
    } catch (e) {
      console.error("Failed to parse GOOGLE_PRIVATE_KEY as JSON:", e);
    }
  }

  // 3. Final PEM formatting for the private key
  if (privateKey) {
    // Replace literal \n with actual newlines
    privateKey = privateKey.replace(/\\n/g, '\n');
    
    // Ensure it has the proper PEM headers/footers
    if (!privateKey.includes('-----BEGIN')) {
      const HEADER = '-----BEGIN PRIVATE KEY-----';
      const FOOTER = '-----END PRIVATE KEY-----';
      
      // Remove any whitespace or characters that shouldn't be in the base64 core
      const core = privateKey.replace(/[^A-Za-z0-9+/=]/g, '');
      const lines = core.match(/.{1,64}/g);
      const wrappedCore = lines ? lines.join('\n') : core;
      privateKey = `${HEADER}\n${wrappedCore}\n${FOOTER}\n`;
    }
  }

  if (!privateKey || !clientEmail || !sheetId) {
    throw new Error("Google Sheets credentials not configured");
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

app.get("/api/debug", (req, res) => {
  res.json({
    GOOGLE_SHEET_ID: !!process.env.GOOGLE_SHEET_ID,
    GOOGLE_CLIENT_EMAIL: !!process.env.GOOGLE_CLIENT_EMAIL,
    GOOGLE_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY,
    GOOGLE_PROJECT_ID: !!process.env.GOOGLE_PROJECT_ID,
    ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
    NODE_ENV: process.env.NODE_ENV
  });
});

app.get("/api/classes", async (req, res) => {
  try {
    const rows = await getSheetData("Classes!A:I");
    if (!rows || rows.length <= 1) {
      console.log("No data rows found in Classes sheet (only header or empty).");
      return res.json([]);
    }
    
    // Skip header row and filter out empty rows (where name is missing)
    const data = rows.slice(1)
      .filter(row => row[0] && row[0].trim() !== "")
      .map((row, index) => ({
        id: index + 2, // Row number in sheet (approximate)
        name: row[0] || "",
        description: row[1] || "",
        date: row[2] || "",
        time: row[3] || "",
        location: row[4] || "",
        type: row[5] || "In-Person",
        instructor: row[6] || "",
        available_seats: row[7] || "Unlimited",
        webAddress: row[8] || ""
      }));
    
    console.log(`Successfully fetched ${data.length} classes from Google Sheets.`);
    res.json(data);
  } catch (error: any) {
    console.error("Error fetching classes:", error);
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
      const linkHtml = webAddress ? `<p><strong>Class Link:</strong> <a href="${webAddress}">${webAddress}</a></p>` : "";
      await mailTransporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: `Registration Confirmation: ${className}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #d32f2f;">Registration Confirmed!</h2>
            <p>Hello <strong>${agentName}</strong>,</p>
            <p>You have successfully registered for <strong>${className}</strong>.</p>
            <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Date:</strong> ${classDate || "Self-Paced"}</p>
              <p style="margin: 5px 0;"><strong>Time:</strong> ${classTime || "N/A"}</p>
              ${linkHtml}
            </div>
            <p>We look forward to seeing you there!</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #999;">This is an automated confirmation from the KW Class Portal.</p>
          </div>
        `
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

app.post("/api/admin/classes", async (req, res) => {
  try {
    const { action, classData, id, password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
    if (!SPREADSHEET_ID) throw new Error("GOOGLE_SHEET_ID not configured");

    const sheets = getSheets();

    if (action !== "delete") {
      const values = [[
        classData.name || "",
        classData.description || "",
        classData.date || "",
        classData.time || "",
        classData.location || "",
        classData.type || "In-Person",
        classData.instructor || "",
        classData.available_seats || "Unlimited",
        classData.webAddress || ""
      ]];

      if (action === "add") {
        await sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: "Classes!A:I",
          valueInputOption: "USER_ENTERED",
          requestBody: { values },
        });
      } else if (action === "edit") {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `Classes!A${id}:I${id}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values },
        });
      }
    } else if (action === "delete") {
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
      const sheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title === "Classes");
      const sheetId = sheet?.properties?.sheetId;

      if (sheetId !== undefined) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: {
                  sheetId: sheetId,
                  dimension: "ROWS",
                  startIndex: id - 1,
                  endIndex: id
                }
              }
            }]
          }
        });
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Admin error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/test-connection", async (req, res) => {
  try {
    const rows = await getSheetData("Classes!A1:A1");
    res.json({ success: true, message: "Successfully connected to Google Sheets!", rows: rows?.length || 0 });
  } catch (error: any) {
    console.error("Connection test failed:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/test-email", async (req, res) => {
  const { email } = req.body;
  try {
    const mailTransporter = getTransporter();
    if (!mailTransporter) throw new Error("Email configuration missing");
    await mailTransporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: "Test Email: KW Class Portal",
      html: "<h1>Email Configuration Successful!</h1>"
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
