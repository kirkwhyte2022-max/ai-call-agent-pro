const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const { Vonage } = require("@vonage/server-sdk");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const VONAGE_API_KEY = process.env.VONAGE_API_KEY;
const VONAGE_API_SECRET = process.env.VONAGE_API_SECRET;
const VONAGE_APPLICATION_ID = process.env.VONAGE_APPLICATION_ID;
const VONAGE_PRIVATE_KEY_PATH = process.env.VONAGE_PRIVATE_KEY_PATH;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const vonage = new Vonage({
  apiKey: VONAGE_API_KEY,
  apiSecret: VONAGE_API_SECRET,
  applicationId: VONAGE_APPLICATION_ID,
  privateKey: VONAGE_PRIVATE_KEY_PATH
});

// =====================
// VONAGE WEBHOOKS
// =====================
app.get("/webhooks/answer", (req, res) => {
  const ncco = [
    {
      action: "talk",
      text: "Hello! Thank you for calling ChachaBoy Logistics. I'm your virtual assistant. How can I help you today?"
    },
    {
      action: "input",
      eventUrl: [`${req.protocol}://${req.get("host")}/webhooks/input`],
      speech: { endOnSilence: 1, language: "en-US" }
    }
  ];
  res.json(ncco);
});

app.post("/webhooks/input", async (req, res) => {
  try {
    const speech = req.body.speech?.results?.[0]?.text || "";
    console.log("Caller said:", speech);

    const aiReply = await getAIResponse(speech);
    const ttsUrl = await generateSpeech(aiReply);

    const ncco = [
      {
        action: "stream",
        streamUrl: [ttsUrl]
      },
      {
        action: "input",
        eventUrl: [`${req.protocol}://${req.get("host")}/webhooks/input`],
        speech: { endOnSilence: 1, language: "en-US" }
      }
    ];
    res.json(ncco);
  } catch (error) {
    console.error("Error handling input:", error);
    res.status(500).send("Server error");
  }
});

app.post("/webhooks/event", (req, res) => {
  console.log("Event:", req.body);
  res.status(200).end();
});

// =====================
// AI CHAT RESPONSE
// =====================
async function getAIResponse(message) {
  if (!OPENAI_API_KEY)
    return "Sorry, my AI brain is currently offline. Please try again later.";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a friendly, natural-sounding virtual assistant for ChachaBoy Logistics. Answer like a real customer service representative, keep responses short and conversational."
          },
          { role: "user", content: message }
        ]
      })
    });
    const data = await response.json();
    return (
      data.choices?.[0]?.message?.content ||
      "I'm sorry, I didn’t catch that. Could you repeat?"
    );
  } catch (err) {
    console.error("AI fetch error:", err);
    return "I'm having trouble connecting to my AI brain.";
  }
}

// =====================
// TEXT-TO-SPEECH (OpenAI)
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
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        responseType: "arraybuffer"
      }
    );

    const fileName = `voice_${Date.now()}.mp3`;
    const filePath = path.join(__dirname, "public", fileName);
    fs.mkdirSync(path.join(__dirname, "public"), { recursive: true });
    fs.writeFileSync(filePath, response.data);

    // Return a public URL for Vonage to stream
    return `${process.env.BASE_URL || "https://ai-call-agent-pro.onrender.com"}/${fileName}`;
  } catch (error) {
    console.error("TTS error:", error.response?.data || error.message);
    return null;
  }
}

// Serve generated audio
app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () =>
  console.log(`✅ AI Call Agent running with realistic voice on ${PORT}`)
);
