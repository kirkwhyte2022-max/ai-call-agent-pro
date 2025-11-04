// server.js — main Express + Twilio + Hugging Face logic
import express from "express";
import fetch from "node-fetch";
import { loadSiteData, getSiteData } from "./siteData.js";

const app = express();
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const HF_API_KEY = process.env.HF_API_KEY;
const HF_MODEL = process.env.HF_MODEL || "google/flan-t5-small";

await loadSiteData();

// Root route
app.get("/", (_, res) => {
  res.send("AI Call Agent Pro is running 🚀");
});

// Voice webhook (initial call)
app.post("/voice", async (_, res) => {
  const twiml = `
    <Response>
      <Say>Hi, this is Chacha Boy Logistics. Please state your question after the beep.</Say>
      <Record transcribe="true" transcribeCallback="/gather" maxLength="10" />
    </Response>`;
  res.type("text/xml");
  res.send(twiml);
});

// Gather transcription & respond
app.post("/gather", express.urlencoded({ extended: true }), async (req, res) => {
  const question = req.body.TranscriptionText || "No question captured.";
  const siteData = getSiteData();

  const prompt = `You are a customer service assistant for Chacha Boy Logistics. 
Website info: ${siteData.slice(0, 5000)} 
Customer asked: ${question}
Respond politely using information from the website.`;

  const hfRes = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
    headers: { Authorization: `Bearer ${HF_API_KEY}`, "Content-Type": "application/json" },
    method: "POST",
    body: JSON.stringify({ inputs: prompt }),
  });

  const hfData = await hfRes.json();
  const reply =
    hfData?.[0]?.generated_text ||
    hfData?.generated_text ||
    "I'm sorry, I couldn't find that information.";

  const twiml = `<Response><Say>${reply}</Say></Response>`;
  res.type("text/xml");
  res.send(twiml);
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
