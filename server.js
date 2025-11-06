// server.js
import express from "express";
import Vonage from "@vonage/server-sdk";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import bodyParser from "body-parser";
import { loadSiteData, getSiteData } from "./siteData.js";

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

// ==========================
// 🔧 Initialize Vonage
// ==========================
const vonage = new Vonage({
  apiKey: process.env.VONAGE_API_KEY,
  apiSecret: process.env.VONAGE_API_SECRET
});

// ==========================
// 🌐 Load website data once on startup
// ==========================
await loadSiteData();

// ==========================
// 🕹️ Route 1: Incoming Call (AI Greeting)
// ==========================
app.get("/vonage/answer", (req, res) => {
  console.log("📞 Incoming call...");

  // Vonage NCCO (call control object)
  const ncco = [
    {
      action: "talk",
      text: "Hi, this is Chacha Boy Logistics, your reliable courier partner. Please ask your question after the beep.",
      language: "en-US",
      style: 3
    },
    {
      action: "record",
      eventUrl: [`${process.env.BASE_URL}/vonage/recording`],
      endOnSilence: 3,
      beepStart: true
    }
  ];

  res.json(ncco);
});

// ==========================
// 🧠 Route 2: Handle Recording Event
// ==========================
app.post("/vonage/recording", async (req, res) => {
  try {
    const { recording_url, uuid } = req.body;

    console.log("🎧 Received recording from Vonage:", recording_url);

    // For now, we’ll skip transcription and just assume caller asked a question
    const callerText = "Caller asked a question about your services.";

    const siteData = getSiteData();
    const prompt = `
You are a helpful, friendly assistant for Chacha Boy Logistics.
Answer naturally, using this information from the company's website:

${siteData.slice(0, 3500)}

Caller said: ${callerText}

Keep the answer short, polite, and informative.
`;

    // ==========================
    // 🧠 Get AI Text Reply (Hugging Face)
    // ==========================
    const hfResponse = await fetch(`https://api-inference.huggingface.co/models/${process.env.HF_MODEL}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: prompt })
    });

    const data = await hfResponse.json();
    const aiReply = data?.[0]?.generated_text || data?.generated_text || "I'm sorry, I didn’t catch that.";

    console.log("🤖 AI Reply:", aiReply);

    // ==========================
    // 🎙️ Convert AI Text to Realistic Voice (ElevenLabs)
    // ==========================
    const ttsResponse = await fetch("https://api.elevenlabs.io/v1/text-to-speech/Rachel", {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: aiReply,
        voice_settings: { stability: 0.4, similarity_boost: 0.9 }
      })
    });

    const audioBuffer = await ttsResponse.arrayBuffer();
    const filePath = path.join("/tmp", `${uuid}.mp3`);
    fs.writeFileSync(filePath, Buffer.from(audioBuffer));

    // ==========================
    // 🔊 Serve the MP3 so Vonage can stream it
    // ==========================
    app.get(`/audio/${uuid}.mp3`, (req2, res2) => {
      res2.setHeader("Content-Type", "audio/mpeg");
      res2.sendFile(filePath);
    });

    // ==========================
    // 📞 Tell Vonage to stream the voice back to the live call
    // ==========================
    await vonage.calls.stream.start(uuid, {
      stream_url: [`${process.env.BASE_URL}/audio/${uuid}.mp3`]
    });

    console.log("🎤 AI voice streamed to call.");
    res.status(200).send("ok");
  } catch (err) {
    console.error("❌ Error handling recording:", err);
    res.status(500).send("Error");
  }
});

// ==========================
// 🩺 Route 3: Health Check
// ==========================
app.get("/", (req, res) => {
  res.send("✅ AI Call Agent Pro is running.");
});

// ==========================
// 🚀 Start Server
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
