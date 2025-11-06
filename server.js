// server.js
import express from "express";
import Vonage from "@vonage/server-sdk";
import fetch from "node-fetch";
import { WebSocketServer } from "ws";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

// ============================
// 🔧 Initialize Vonage
// ============================
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
});

// ============================
// 🌐 Load Website Content (Chacha Boy Logistics)
// ============================
let siteContent = "Welcome to Chacha Boy Logistics. We are a delivery and courier service based in Jamaica.";

async function loadSiteContent() {
  try {
    console.log("🌍 Fetching website content...");
    const response = await fetch(process.env.SITE_URL);
    const html = await response.text();

    // Extract visible text from HTML (simple regex cleanup)
    siteContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<\/?[^>]+(>|$)/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 8000);

    console.log("✅ Website content loaded.");
  } catch (err) {
    console.error("❌ Failed to fetch website:", err);
  }
}
await loadSiteContent();

// ============================
// 🕹️ Route 1: Incoming Call → Connect to Live WebSocket
// ============================
app.get("/vonage/answer", (req, res) => {
  console.log("📞 Incoming live call...");

  const ncco = [
    {
      action: "talk",
      text: "Hello! This is Chacha Boy Logistics. You’re speaking with our AI assistant. How can I help you today?",
      language: "en-US",
      style: 3,
    },
    {
      action: "connect",
      eventType: "synchronous",
      endpoint: [
        {
          type: "websocket",
          uri: `wss://${process.env.BASE_URL.replace("https://", "")}/ws`,
          contentType: "audio/l16;rate=16000",
          headers: { customer: "chachaboy" },
        },
      ],
    },
  ];

  res.json(ncco);
});

// ============================
// 🧠 WebSocket: Handle Real-Time Audio
// ============================
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  console.log("🔗 Vonage connected to WebSocket stream");

  let openaiWs = null;

  (async () => {
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-01",
        voice: "none",
        instructions: `
You are a helpful AI call agent for Chacha Boy Logistics in Jamaica.
Use the company’s website information to answer questions accurately and naturally.
Keep responses short, friendly, and conversational.
Website Info:
${siteContent}`,
      }),
    });

    const session = await response.json();
    const openaiUrl = session.client_secret.value;

    openaiWs = new WebSocket(openaiUrl, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    });

    openaiWs.on("open", () => console.log("🤖 Connected to OpenAI Realtime API"));
    openaiWs.on("message", (msg) => console.log("📨 OpenAI Message:", msg.toString()));
  })();

  ws.on("message", async (message) => {
    const msg = JSON.parse(message.toString());

    if (msg.event === "media" && openaiWs?.readyState === 1) {
      openaiWs.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: msg.media.payload,
        })
      );
    }

    if (msg.event === "stop" && openaiWs?.readyState === 1) {
      openaiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      openaiWs.send(JSON.stringify({ type: "response.create" }));
    }
  });

  // Handle AI → Voice reply
  if (openaiWs) {
    openaiWs.on("message", async (msg) => {
      const data = JSON.parse(msg.toString());
      const aiText = data?.response?.output?.[0]?.content?.[0]?.text;

      if (aiText) {
        console.log("🧠 AI Response:", aiText);

        // Convert to realistic voice using ElevenLabs
        const ttsRes = await fetch("https://api.elevenlabs.io/v1/text-to-speech/Rachel", {
          method: "POST",
          headers: {
            "xi-api-key": process.env.ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: aiText,
            voice_settings: { stability: 0.4, similarity_boost: 0.9 },
          }),
        });

        const audioBuffer = await ttsRes.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString("base64");

        ws.send(
          JSON.stringify({
            event: "media",
            media: { payload: base64Audio },
          })
        );
      }
    });
  }

  ws.on("close", () => {
    console.log("🔌 Vonage call stream closed");
    if (openaiWs) openaiWs.close();
  });
});

// ============================
// 🩺 Health Check
// ============================
app.get("/", (req, res) => res.send("✅ AI Call Agent Pro (Realtime + Website Context) is running"));

// ============================
// 🚀 Start Server + WebSocket Upgrade
// ============================
const server = app.listen(process.env.PORT || 3000, () =>
  console.log(`🚀 Server running on port ${process.env.PORT || 3000}`)
);

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/ws") {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});
