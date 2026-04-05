import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Google Sheets Auth
const rawKey = process.env.GOOGLE_PRIVATE_KEY;
let privateKey = rawKey?.trim();
let clientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
let projectId = process.env.GOOGLE_PROJECT_ID?.trim();

// 1. Robust JSON Detection (handles leading/trailing quotes or spaces)
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
  console.log("Detected JSON format in credentials, extracting fields.");
  if (finalJson.private_key) privateKey = finalJson.private_key;
  if (finalJson.client_email) clientEmail = finalJson.client_email;
  if (finalJson.project_id) projectId = finalJson.project_id;
}

// 2. Clean up all credential strings globally
function cleanCredential(val: string | undefined): string | undefined {
  if (!val) return val;
  let cleaned = val.trim();
  
  // Handle accidental "KEY=VALUE" or "KEY: VALUE" prefixes
  // We look for common patterns like GOOGLE_PRIVATE_KEY= or client_email:
  const prefixMatch = cleaned.match(/^(?:export\s+)?(?:GOOGLE_[A-Z_]+|client_email|project_id|private_key)\s*[=:]\s*/i);
  if (prefixMatch) {
    cleaned = cleaned.substring(prefixMatch[0].length).trim();
  }

  // Remove all surrounding quotes (repeatedly)
  while (cleaned.startsWith('"') || cleaned.startsWith("'") || cleaned.endsWith('"') || cleaned.endsWith("'")) {
    cleaned = cleaned.replace(/^["']|["']$/g, '').trim();
  }
  
  // Remove any accidental trailing/leading JSON artifacts or whitespace
  cleaned = cleaned.replace(/[,}"']+$/, '').replace(/^["'{,]+/, '').trim();
  
  return cleaned;
}

privateKey = cleanCredential(privateKey);
clientEmail = cleanCredential(clientEmail);
projectId = cleanCredential(projectId);

if (projectId && projectId.length < 3) {
  console.error("CRITICAL: GOOGLE_PROJECT_ID is too short (%d chars). It might be truncated.", projectId.length);
}

// If the private key still looks like it has a prefix (e.g. "private_key": "...")
if (privateKey && privateKey.includes('": "')) {
  const parts = privateKey.split('": "');
  privateKey = parts[parts.length - 1];
}

// Strict validation for service account email format
const isServiceAccountEmail = (email: string) => {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.iam\.gserviceaccount\.com$/.test(email) || 
         /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.gserviceaccount\.com$/.test(email);
};

if (clientEmail) {
  if (!clientEmail.includes('@')) {
    console.error("CRITICAL: GOOGLE_CLIENT_EMAIL is not a valid email address:", clientEmail);
  } else if (clientEmail.length < 10) {
    console.error("CRITICAL: GOOGLE_CLIENT_EMAIL is too short (%d chars). It might be truncated.", clientEmail.length);
  } else if (!isServiceAccountEmail(clientEmail)) {
    console.warn("WARNING: GOOGLE_CLIENT_EMAIL may not be a standard Google Service Account email. Expected format: user@project.iam.gserviceaccount.com. Current:", clientEmail);
  }
}

if (privateKey) {
  // 3. Handle multiple levels of escaping for \n, \r, \t
  while (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }
  while (privateKey.includes('\\r')) {
    privateKey = privateKey.replace(/\\r/g, '\r');
  }
  while (privateKey.includes('\\t')) {
    privateKey = privateKey.replace(/\\t/g, '\t');
  }
  while (privateKey.includes('\\v')) {
    privateKey = privateKey.replace(/\\v/g, '\v');
  }
  while (privateKey.includes('\\f')) {
    privateKey = privateKey.replace(/\\f/g, '\f');
  }
  while (privateKey.includes('\\b')) {
    privateKey = privateKey.replace(/\\b/g, '\b');
  }
  while (privateKey.includes('\\0')) {
    privateKey = privateKey.replace(/\\0/g, '\0');
  }
  while (privateKey.includes("\\'")) {
    privateKey = privateKey.replace(/\\'/g, "'");
  }
  while (privateKey.includes('\\"')) {
    privateKey = privateKey.replace(/\\"/g, '"');
  }
  while (privateKey.includes('\\\\')) {
    privateKey = privateKey.replace(/\\\\/g, '\\');
  }
  // Handle \xHH hex escapes
  privateKey = privateKey.replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  // Handle \uHHHH unicode escapes
  privateKey = privateKey.replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  // Handle \u{HHHH} extended unicode escapes
  privateKey = privateKey.replace(/\\u\{([0-9A-Fa-f]+)\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
  // Handle \OOO octal escapes
  privateKey = privateKey.replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
  // Handle \cX control escapes
  privateKey = privateKey.replace(/\\c([A-Za-z])/g, (_, char) => String.fromCharCode(char.toUpperCase().charCodeAt(0) - 64));
  // Handle escaped spaces
  privateKey = privateKey.replace(/\\ /g, ' ');
  // Handle escaped punctuation
  privateKey = privateKey.replace(/\\([!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])/g, '$1');
  
  // 4. Ensure the PEM format is clean
  // Detect header type (PKCS#8 or PKCS#1)
  const isRsa = privateKey.includes('RSA PRIVATE KEY');
  const HEADER = isRsa ? '-----BEGIN RSA PRIVATE KEY-----' : '-----BEGIN PRIVATE KEY-----';
  const FOOTER = isRsa ? '-----END RSA PRIVATE KEY-----' : '-----END PRIVATE KEY-----';
  
  // Extract the base64 core
  let core = privateKey;
  if (privateKey.includes(HEADER)) {
    core = privateKey.split(HEADER)[1];
  }
  if (core.includes(FOOTER)) {
    core = core.split(FOOTER)[0];
  }
  
  // Remove all whitespace and non-base64 characters from the core
  core = core.replace(/[^A-Za-z0-9+/=]/g, '');
  
  if (core.length < 1000) {
    console.error("CRITICAL: Extracted private key core is too short (%d chars). It might be corrupted or truncated. A full key is usually ~1600+ chars.", core.length);
  }

  // Reconstruct with proper PEM formatting (64 chars per line)
  const lines = core.match(/.{1,64}/g);
  const wrappedCore = lines ? lines.join('\n') : core;
  privateKey = `${HEADER}\n${wrappedCore}\n${FOOTER}\n`;
  
  console.log("Credential Diagnostic:");
  console.log("- Project ID:", projectId);
  console.log("- Client Email:", clientEmail);
  if (clientEmail) {
    console.log("- Client Email (Hex):", Buffer.from(clientEmail).toString('hex'));
    console.log("- Client Email Length:", clientEmail.length);
  }
  console.log("- Private Key Length:", privateKey.length);
  console.log("- Private Key Header:", HEADER);
  console.log("- Private Key Core Length:", core.length);
  console.log("- Private Key Preview:", `${privateKey.substring(0, 30)}...${privateKey.substring(privateKey.length - 30).trim()}`);
}

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

if (!privateKey || privateKey.includes('YOUR_PRIVATE_KEY_HERE') || privateKey === 'null' || privateKey === 'undefined') {
  console.error("CRITICAL: GOOGLE_PRIVATE_KEY is missing or contains placeholder text.");
  privateKey = undefined;
}
if (!clientEmail || clientEmail.includes('your_service_account_email_here') || clientEmail === 'null' || clientEmail === 'undefined') {
  console.error("CRITICAL: GOOGLE_CLIENT_EMAIL is missing or contains placeholder text.");
  clientEmail = undefined;
}
if (!SPREADSHEET_ID || SPREADSHEET_ID.includes('your_google_sheet_id_here') || SPREADSHEET_ID === 'null' || SPREADSHEET_ID === 'undefined') {
  console.error("CRITICAL: GOOGLE_SHEET_ID is missing or contains placeholder text.");
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

const sheets = google.sheets({ version: "v4", auth });

if (SPREADSHEET_ID && SPREADSHEET_ID.length < 20) {
  console.error("CRITICAL: GOOGLE_SHEET_ID is too short (%d chars). It might be truncated. A full ID is usually ~44 chars.", SPREADSHEET_ID.length);
}
if (SPREADSHEET_ID?.includes('docs.google.com/spreadsheets/d/')) {
  console.error("CRITICAL: GOOGLE_SHEET_ID looks like a full URL. Please use only the ID part (the string between /d/ and /edit).");
}

// Helper to get sheet data
async function getSheetData(range: string) {
  if (!SPREADSHEET_ID || !privateKey || !clientEmail) {
    throw new Error("Google Sheets credentials or Sheet ID not configured");
  }
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  return response.data.values;
}

// Email Transporter
let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    let host = process.env.EMAIL_HOST;
    const port = parseInt(process.env.EMAIL_PORT || "587");
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    // Fix common typo: smpt -> smtp
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
  }
  return transporter;
}

async function sendConfirmationEmail(data: any) {
  const mailTransporter = getTransporter();
  if (!mailTransporter) {
    console.warn("Email configuration missing. Skipping confirmation email.");
    return;
  }

  const { className, classDate, classTime, classType, agentName, email, phone, marketCenter, webAddress } = data;
  const isSelfPaced = classType?.toLowerCase() === 'self-paced' || (!classDate && !classTime);

  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: email,
    subject: `Registration Confirmation: ${className}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; overflow: hidden;">
        <div style="background-color: #b91c1c; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">Registration Confirmed!</h1>
        </div>
        <div style="padding: 30px;">
          <p>Hello <strong>${agentName}</strong>,</p>
          <p>You have successfully registered for the following class:</p>
          
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="margin-top: 0; color: #111827;">${className}</h2>
            ${!isSelfPaced ? `
              <p style="margin: 5px 0;"><strong>Date:</strong> ${classDate}</p>
              <p style="margin: 5px 0;"><strong>Time:</strong> ${classTime}</p>
            ` : `
              <p style="margin: 5px 0;"><strong>Format:</strong> Self-Paced / Online</p>
              ${webAddress ? `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                  <p style="margin-bottom: 10px; font-weight: bold; color: #b91c1c;">Ready to start?</p>
                  <a href="${webAddress}" style="display: inline-block; background-color: #b91c1c; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">Start Class Here</a>
                </div>
              ` : ''}
            `}
          </div>

          <h3>Your Registration Details:</h3>
          <ul style="list-style: none; padding: 0;">
            <li style="margin-bottom: 8px;"><strong>Name:</strong> ${agentName}</li>
            <li style="margin-bottom: 8px;"><strong>Email:</strong> ${email}</li>
            <li style="margin-bottom: 8px;"><strong>Phone:</strong> ${phone}</li>
            <li style="margin-bottom: 8px;"><strong>Market Center:</strong> ${marketCenter}</li>
          </ul>

          <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
            If you need to cancel or reschedule, please contact your Market Center administrator.
          </p>
        </div>
        <div style="background-color: #f3f4f6; padding: 15px; text-align: center; color: #9ca3af; font-size: 12px;">
          © ${new Date().getFullYear()} KW Brokerage Portal
        </div>
      </div>
    `,
  };

  try {
    await mailTransporter.sendMail(mailOptions);
    console.log(`Confirmation email sent to ${email}`);
  } catch (error) {
    console.error("Error sending confirmation email:", error);
  }
}

// API Routes
app.get("/api/config-check", (req, res) => {
  const emailPreview = clientEmail 
    ? `${clientEmail.substring(0, 3)}...${clientEmail.substring(clientEmail.length - 10)}`
    : 'missing';
    
  const isSheetIdUrl = SPREADSHEET_ID?.includes('docs.google.com/spreadsheets/d/');
    
  res.json({
    sheetId: !!SPREADSHEET_ID,
    sheetIdIsUrl: isSheetIdUrl,
    clientEmail: !!clientEmail,
    clientEmailPreview: emailPreview,
    privateKey: !!privateKey,
    privateKeyFormat: privateKey?.includes('RSA PRIVATE KEY') ? 'PKCS#1 (RSA)' : 'PKCS#8',
    privateKeyCoreLength: privateKey ? privateKey.replace(/-----.*?-----|\s/g, '').length : 0,
    privateKeyPreview: privateKey ? `${privateKey.substring(0, 20)}...${privateKey.substring(privateKey.length - 20).trim()}` : 'missing',
    projectId: !!projectId,
    env: process.env.NODE_ENV
  });
});

app.get("/api/classes", async (req, res) => {
  try {
    const rows = await getSheetData("Classes!A:I");
    if (!rows || rows.length <= 1) return res.json([]);
    
    // Explicit mapping to match ClassItem interface
    const data = rows.slice(1).map((row, index) => {
      return {
        id: index + 2, // Row number in sheet
        name: row[0] || "",
        description: row[1] || "",
        date: row[2] || "",
        time: row[3] || "",
        location: row[4] || "",
        type: row[5] || "In-Person",
        instructor: row[6] || "",
        available_seats: row[7] || 0,
        webAddress: row[8] || ""
      };
    });
    res.json(data);
  } catch (error: any) {
    console.error("Error fetching classes:", error);
    let message = error.message;
    if (error.code === 403) {
      message = "Permission Denied: Please share your Google Sheet with the Service Account email as an 'Editor'.";
    } else if (error.code === 404) {
      message = "Sheet Not Found: Please check your GOOGLE_SHEET_ID and ensure a tab named 'Classes' exists.";
    } else if (error.message?.includes('account not found')) {
      message = `Authentication Error: Service account email not found. Please verify your GOOGLE_CLIENT_EMAIL is correct and matches your service account. (Current: ${clientEmail})`;
    }
    res.status(500).json({ error: message });
  }
});

app.post("/api/admin/test-email", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const mailTransporter = getTransporter();
    if (!mailTransporter) {
      throw new Error("Email configuration missing. Please check your environment variables.");
    }

    await mailTransporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: email,
      subject: "Test Email: KW Class Portal",
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h1 style="color: #b91c1c;">Email Configuration Successful!</h1>
          <p>This is a test email from your <strong>KW Class Portal</strong>.</p>
          <p>If you received this, your SMTP settings are working correctly.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #9ca3af;">Sent at: ${new Date().toLocaleString()}</p>
        </div>
      `,
    });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error sending test email:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { classId, className, classDate, classTime, classType, agentName, email, phone, marketCenter, webAddress } = req.body;
    if (!SPREADSHEET_ID) throw new Error("GOOGLE_SHEET_ID not configured");
    if (!classId) throw new Error("Class ID is required for registration");

    console.log(`Registering for class: ${className} (ID: ${classId}, Type: ${classType})`);

    // 1. Add registration
    const registrationValues = [
      new Date().toISOString(),
      className || "",
      classDate || "",
      classTime || "",
      agentName || "",
      email || "",
      phone || "",
      marketCenter || ""
    ];

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "Registrations!A:H",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [registrationValues],
        },
      });
    } catch (e: any) {
      // If tab doesn't exist, create it
      if (e.code === 404 || (e.message && e.message.includes('not found'))) {
        console.log("Registrations tab not found, creating it...");
        try {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
              requests: [{ addSheet: { properties: { title: "Registrations" } } }]
            }
          });
          // Add headers
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: "Registrations!A1:H1",
            valueInputOption: "USER_ENTERED",
            requestBody: {
              values: [["Timestamp", "Class Name", "Date", "Time", "Agent Name", "Email", "Phone", "Market Center"]]
            }
          });
          // Retry append
          await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "Registrations!A:H",
            valueInputOption: "USER_ENTERED",
            requestBody: {
              values: [registrationValues],
            },
          });
        } catch (createErr) {
          console.error("Failed to create Registrations tab:", createErr);
          throw createErr;
        }
      } else {
        console.error("Error appending to Registrations sheet:", e);
        throw e;
      }
    }

    // 2. Update available seats
    try {
      const rows = await getSheetData(`Classes!A${classId}:H${classId}`);
      if (rows && rows[0]) {
        const typeIndex = 5; // Column F
        const seatIndex = 7; // Column H
        const fetchedClassType = rows[0][typeIndex] || "";
        const seatValue = rows[0][seatIndex] || "";
        
        const isSelfPaced = fetchedClassType.toLowerCase() === 'self-paced';
        const isUnlimited = seatValue.toString().toLowerCase() === 'unlimited';

        if (!isSelfPaced && !isUnlimited) {
          const currentSeats = parseInt(seatValue) || 0;
          if (currentSeats > 0) {
            await sheets.spreadsheets.values.update({
              spreadsheetId: SPREADSHEET_ID,
              range: `Classes!H${classId}`,
              valueInputOption: "USER_ENTERED",
              requestBody: {
                values: [[currentSeats - 1]],
              },
            });
          }
        }
      }
    } catch (seatErr) {
      console.warn("Could not update seats, but registration was successful:", seatErr);
    }

    // 3. Send confirmation email
    await sendConfirmationEmail({ className, classDate, classTime, classType, agentName, email, phone, marketCenter, webAddress });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Error registering:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
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

    // Ensure headers exist if the sheet is empty
    if (action === "add") {
      try {
        const existing = await getSheetData("Classes!A1:A1");
        if (!existing || existing.length === 0) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: "Classes!A1:I1",
            valueInputOption: "USER_ENTERED",
            requestBody: {
              values: [["Name", "Description", "Date", "Time", "Location", "Type", "Instructor", "Available Seats", "Web Address"]]
            }
          });
        }
      } catch (e: any) {
        // If sheet doesn't exist, try to create it
        if (e.code === 404 || (e.message && e.message.includes('not found'))) {
          console.log("Classes tab not found, creating it...");
          try {
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId: SPREADSHEET_ID,
              requestBody: {
                requests: [{ addSheet: { properties: { title: "Classes" } } }]
              }
            });
            // Add headers
            await sheets.spreadsheets.values.update({
              spreadsheetId: SPREADSHEET_ID,
              range: "Classes!A1:I1",
              valueInputOption: "USER_ENTERED",
              requestBody: {
                values: [["Name", "Description", "Date", "Time", "Location", "Type", "Instructor", "Available Seats", "Web Address"]]
              }
            });
          } catch (createErr) {
            console.error("Failed to create Classes tab:", createErr);
          }
        } else {
          console.warn("Could not verify headers, proceeding with append.");
        }
      }
    }

    if (action !== "delete") {
      const values = [[
        classData.name || "",
        classData.description || "",
        classData.date || "",
        classData.time || "",
        classData.location || "",
        classData.type || "In-Person",
        classData.instructor || "",
        classData.available_seats || 0,
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
      // Get sheet ID for "Classes"
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
      const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === "Classes");
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
                  startIndex: id - 1, // 0-based
                  endIndex: id
                }
              }
            }]
          }
        });
      } else {
        // Fallback to clear if sheetId not found
        await sheets.spreadsheets.values.clear({
          spreadsheetId: SPREADSHEET_ID,
          range: `Classes!A${id}:I${id}`,
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
    res.status(500).json({ 
      success: false, 
      error: error.message,
      code: error.code,
      details: error.response?.data || error.errors
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
