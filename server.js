import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { loadSiteData, getSiteData } from "./siteData.js";

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const HF_API_KEY = process.env.HF_API_KEY;
const HF_MODEL = process.env.HF_MODEL || "google/flan-t5-small";

await loadSiteData();

// Plivo uses XML responses (called "Plivo XML") to control calls.
// When a call comes in, Plivo requests /plivo/answer.
app.post("/plivo/answer", async (req, res) => {
  const plivoXML = `
  <Response>
    <Speak>Hi, this is Chacha Boy Logistics. Please ask your question after the beep.</Speak>
    <Record maxLength="10" playBeep="true" recordFormat="wav" callbackUrl="/plivo/recording" />
  </Response>`;
  res.type("application/xml");
  res.send(plivoXML);
});

// When the caller finishes speaking, Plivo hits this callback URL with the recording link.
app.post("/plivo/recording", async (req, res) => {
  const recordingUrl = req.body.RecordUrl;

  // NOTE: Plivo doesn’t provide built-in transcription on free tier.
  // So we use the URL (if accessible) for debugging, or integrate external STT later.
  const questionText = "Caller left a message. Please summarize and answer generally.";

  const siteData = getSiteData();

  const prompt = `You are a polite AI assistant for Chacha Boy Logistics.
Website info: ${siteData.slice(0, 4000)}
The customer said (from recording): ${questionText}
Answer naturally and clearly.`;

  try {
    const hfRes = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
      headers: { Authorization: `Bearer ${HF_API_KEY}`, "Content-Type": "application/json" },
      method: "POST",
      body: JSON.stringify({ inputs: prompt }),
    });

    const hfData = await hfRes.json();
    const reply =
      hfData?.[0]?.generated_text ||
      hfData?.generated_text ||
      "I’m sorry, I couldn’t get that. Could you please repeat?";

    const plivoResponse = `<Response><Speak>${reply}</Speak></Response>`;
    res.type("application/xml");
    res.send(plivoResponse);
  } catch (err) {
    console.error("Error contacting Hugging Face:", err);
    res.type("application/xml");
    res.send(`<Response><Speak>Sorry, an error occurred.</Speak></Response>`);
  }
});

app.get("/", (_, res) => res.send("AI Call Agent Pro (Plivo) is running 🚀"));

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
