import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { loadSiteData, getSiteData } from "./siteData.js";

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const HF_API_KEY = process.env.HF_API_KEY;
const HF_MODEL = process.env.HF_MODEL || "google/flan-t5-small";

await loadSiteData();

/**
 * Vonage webhook when a call starts.
 * Responds with an NCCO (JSON) to control call flow.
 */
app.get("/vonage/answer", (req, res) => {
  const ncco = [
    {
      action: "talk",
  text: "Hi, this is Chacha Boy Logistics. Please ask your question after the beep.",
  voiceName: "Joanna", // Try “Amy”, “Brian”, or “Matthew” for different accents
  language: "en-US"
    },
    {
      action: "record",
      eventUrl: [`${process.env.BASE_URL}/vonage/recording`],
      beepStart: true,
      endOnSilence: 3
    }
  ];
  res.json(ncco);
});

/**
 * Called by Vonage when the caller finishes speaking.
 */
app.post("/vonage/recording", async (req, res) => {
  const { recording_url } = req.body;

  console.log("🎧 Received recording URL:", recording_url);

  // Placeholder text until speech-to-text integration is added
  const callerText = "Caller left a message. Please answer based on website information.";

  const siteData = getSiteData();
  const prompt = `
You are a helpful AI assistant for Chacha Boy Logistics.
Use the following website data to answer the caller's question.
Website info: ${siteData.slice(0, 4000)}
Caller said: ${callerText}
Answer politely and concisely.`;

  try {
    const hfRes = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
      headers: { Authorization: `Bearer ${HF_API_KEY}`, "Content-Type": "application/json" },
      method: "POST",
      body: JSON.stringify({ inputs: prompt })
    });

    const data = await hfRes.json();
    const aiReply =
      data?.[0]?.generated_text || data?.generated_text || "Sorry, I couldn’t understand the question.";

    const ncco = [
      {
        action: "talk",
        text: aiReply
      }
    ];

    res.json(ncco);
  } catch (err) {
    console.error("❌ AI Error:", err);
    res.json([{ action: "talk", text: "Sorry, something went wrong processing your request." }]);
  }
});

app.get("/", (_, res) => res.send("✅ AI Call Agent Pro (Vonage version) is live"));

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
