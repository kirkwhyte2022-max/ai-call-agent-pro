const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const { Vonage } = require("@vonage/server-sdk");
const fetch = require("node-fetch");

dotenv.config();

const app = express();
app.use(bodyParser.json());

// =====================
// 🔐 ENVIRONMENT VARIABLES
// =====================
const PORT = process.env.PORT || 3000;
const VONAGE_API_KEY = process.env.VONAGE_API_KEY;
const VONAGE_API_SECRET = process.env.VONAGE_API_SECRET;
const VONAGE_APPLICATION_ID = process.env.VONAGE_APPLICATION_ID;
const VONAGE_PRIVATE_KEY_PATH = process.env.VONAGE_PRIVATE_KEY_PATH;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // For AI responses

// Initialize Vonage
const vonage = new Vonage({
  apiKey: VONAGE_API_KEY,
  apiSecret: VONAGE_API_SECRET,
  applicationId: VONAGE_APPLICATION_ID,
  privateKey: VONAGE_PRIVATE_KEY_PATH
});

// =====================
// 📞 VONAGE WEBHOOKS
// =====================

// 1. When someone calls your number
app.get("/webhooks/answer", (req, res) => {
  const ncco = [
    {
      action: "talk",
      text: "Hello! Thank you for calling ChachaBoy Logistics. I'm your virtual assistant. How can I help you today?"
    },
    {
      action: "input",
      eventUrl: [`${req.protocol}://${req.get("host")}/webhooks/input`],
      speech: {
        endOnSilence: 1,
        language: "en-US"
      }
    }
  ];

  res.json(ncco);
});

// 2. When user speaks, get their speech text
app.post("/webhooks/input", async (req, res) => {
  try {
    const speech = req.body.speech?.results?.[0]?.text || "";
    console.log("Caller said:", speech);

    // Generate AI response (you can replace this with your own logic or LLM)
    const aiReply = await getAIResponse(speech);

    // Respond with AI's voice
    const ncco = [
      {
        action: "talk",
        text: aiReply
      },
      {
        action: "input",
        eventUrl: [`${req.protocol}://${req.get("host")}/webhooks/input`],
        speech: {
          endOnSilence: 1,
          language: "en-US"
        }
      }
    ];

    res.json(ncco);
  } catch (error) {
    console.error("Error processing speech:", error);
    res.status(500).send("Server error");
  }
});

// 3. Event URL (Vonage logs)
app.post("/webhooks/event", (req, res) => {
  console.log("Event:", req.body);
  res.status(200).end();
});

// =====================
// 🤖 AI RESPONSE FUNCTION
// =====================
async function getAIResponse(message) {
  if (!OPENAI_API_KEY) {
    return "Sorry, my AI brain is currently offline. Please try again later.";
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a friendly and professional virtual assistant for ChachaBoy Logistics." },
          { role: "user", content: message }
        ]
      })
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "I'm sorry, I didn't catch that. Could you please repeat?";
  } catch (err) {
    console.error("AI fetch error:", err);
    return "I'm having trouble connecting to my AI brain. Please try again later.";
  }
}

// =====================
// 🚀 START SERVER
// =====================
app.listen(PORT, () => {
  console.log(`✅ AI Call Agent running on port ${PORT}`);
});
