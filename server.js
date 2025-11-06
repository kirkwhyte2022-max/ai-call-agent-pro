// server.js
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { Vonage } from "@vonage/server-sdk";
import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

// =====================
// Constants & Setup
// =====================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 10000;
const BASE_URL = process.env.BASE_URL || "https://ai-call-agent-pro.onrender.com";

// Initialize Vonage SDK
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET,
  applicationId: process.env.VONAGE_APPLICATION_ID,
  privateKey: fs.readFileSync(process.env.VONAGE_PRIVATE_KEY_PATH)
});

const app = express();
app.use(bodyParser.json());

// Serve static files (generated audio)
app.use(express.static(path.join(__dirname, "public")));

// =====================
// Vonage Webhooks
// =====================

// Answer URL: called when someone calls your Vonage number
app.get("/webhooks/answer", (req, res) => {
  const ncco = [
    {
      action: "talk",
      text: "Hello! This is your AI assistant for ChachaBoy Logistics. How may I assist you today?",
      language: "en-US",
      style: 2
    },
    {
      action: "input",
      eventUrl: [`${BASE_URL}/webhooks/input`],
      speech: { endOnSilence: 1, language: "en-US" }
    }
  ];
  res.json(ncco);
});

// Input URL: called when the caller speaks
app.post("/webhooks/input", async (req, res) => {
  try {
    const speech = req.body.speech?.results?.[0]?.text || "";
    console.log("Caller said:", speech);

    // Generate AI response
    const aiReply = await getAIResponse(speech);

    // Generate TTS audio
    const ttsUrl = await generateSpeech(aiReply);

    const ncco = [
      {
        action: "stream",
        streamUrl: [ttsUrl]
      },
      {
        action: "input",
        eventUrl: [`${BASE_URL}/webhooks/input`],
        speech: { endOnSilence: 1, language: "en-US" }
      }
    ];

    res.json(ncco);
  } catch (err) {
    console.error("Error handling input:", err);
    res.status(500).send("Server error");
  }
});

// Event URL: logs call events
app.post("/webhooks/event", (req, res) => {
  console.log("Vonage Event:", req.body);
  res.status(200).end();
});

// Test endpoint
app.get("/", (req, res) => {
  res.send("✅ AI Call Agent Pro is running.");
});

// =====================
// AI Chat with OpenAI
// =====================
async function getAIResponse(message) {
  if (!process.env.OPENAI_API_KEY) {
    return "Sorry, my AI brain is offline. Please try again later.";
  }

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a friendly, natural-sounding virtual assistant for ChachaBoy Logistics. Respond like a real customer service representative."
          },
          { role: "user", content: message }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data.choices?.[0]?.message?.content || "I'm sorry, could you repeat that?";
  } catch (err) {
    console.error("AI error:", err.response?.data || err.message);
    return "I'm having trouble connecting to my AI brain. Please try again later.";
  }
}

// =====================
// OpenAI Text-to-Speech (TTS)
// =====================
async function generateSpeech(text) {
  try {
    console.log("Generating speech for:", text);

    const response = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      {
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: text
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        responseType: "arraybuffer"
      }
    );

    // Save audio locally
    const fileName = `voice_${Date.now()}.mp3`;
    const dirPath = path.join(__dirname, "public");
    fs.mkdirSync(dirPath, { recursive: true });
    const filePath = path.join(dirPath, fileName);
    fs.writeFileSync(filePath, response.data);

    // Return public URL for Vonage to stream
    return `${BASE_URL}/${fileName}`;
  } catch (err) {
    console.error("TTS error:", err.response?.data || err.message);
    return null;
  }
}

// =====================
// Start server
// =====================
app.listen(PORT, () => {
  console.log(`✅ AI Call Agent running with realistic voice on port ${PORT}`);
});
