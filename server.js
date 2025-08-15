import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import cors from "cors";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
}));

// Check OpenAI API key
if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY not found in environment variables!");
    process.exit(1);
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// -------------------
// STEP 1: Scrape Website with better error handling
// -------------------
async function scrapePage(url) {
    try {
        console.log(`📄 Scraping: ${url}`);
        const res = await fetch(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!res.ok) {
            console.log(`⚠️  Failed to fetch ${url}: ${res.status} ${res.statusText}`);
            return "";
        }

        const html = await res.text();
        const $ = cheerio.load(html);

        // Remove unwanted elements but keep more content
        $("script, style, noscript, .cookie-banner, #cookie-consent").remove();

        // Try to get structured content first
        let content = "";

        // Look for main content areas
        const contentSelectors = [
            'main', '[role="main"]', '.main-content', '#main-content',
            '.content', '#content', '.page-content', '.container',
            'article', '.article', 'section', '.section'
        ];

        let foundContent = false;
        for (const selector of contentSelectors) {
            const elements = $(selector);
            if (elements.length > 0) {
                elements.each((i, el) => {
                    const text = $(el).text().trim();
                    if (text.length > 100) {
                        content += text + " ";
                        foundContent = true;
                    }
                });
                if (foundContent) break;
            }
        }

        // If no structured content found, get everything
        if (!foundContent || content.length < 200) {
            content = $("body").text();
        }

        // Clean up the text
        const cleanText = content
            .replace(/\s+/g, " ")
            .replace(/\n+/g, " ")
            .trim();

        // Log a preview of what we scraped
        console.log(`✅ Scraped ${url}: ${cleanText.length} characters`);
        console.log(`Preview: ${cleanText.substring(0, 200)}...`);

        return cleanText;
    } catch (error) {
        console.log(`❌ Error scraping ${url}:`, error.message);
        return "";
    }
}

async function scrapeWebsite() {
    console.log("🚀 Starting website scraping...");

    // Since scraping isn't working well, let's add manual content for now
    // and still try to scrape for any additional content

    const pages = [
        "https://www.yapcapitalist.com/",
        "https://www.yapcapitalist.com/apply",
        "https://www.yapcapitalist.com/webinar",
        "https://www.yapcapitalist.com/application-form"
    ];

    let scrapedText = "";
    let successCount = 0;

    // Try to scrape first
    for (const page of pages) {
        const text = await scrapePage(page);
        if (text.length > 50) { // Only count if we got meaningful content
            scrapedText += `\n\n=== PAGE: ${page} ===\n${text}`;
            successCount++;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Add comprehensive manual content about Yap Capitalist
    // This ensures the bot has good information to work with

    fs.writeFileSync("siteData.txt", scrapedText, "utf8");
    console.log(`✅ Content prepared! Manual content + ${successCount}/${pages.length} scraped pages`);
    console.log(`📁 Total content: ${scrapedText.length} characters saved to siteData.txt`);
}

// -------------------
// STEP 2: Initialize scraping
// -------------------
async function initializeData() {
    if (!fs.existsSync("siteData.txt")) {
        console.log("📂 siteData.txt not found, scraping website...");
        await scrapeWebsite();
    } else {
        const existingData = fs.readFileSync("siteData.txt", "utf8");
        console.log(`📂 Found existing siteData.txt: ${existingData.length} characters`);

        // If file is too small, re-scrape
        if (existingData.length < 100) {
            console.log("⚠️  Existing data too small, re-scraping...");
            await scrapeWebsite();
        }
    }
}

// Initialize data on startup
initializeData().catch(console.error);

// -------------------
// STEP 3: Debug endpoint to check data
// -------------------
app.get("/debug", (req, res) => {
    try {
        if (!fs.existsSync("siteData.txt")) {
            return res.json({
                status: "error",
                message: "siteData.txt not found"
            });
        }

        const siteData = fs.readFileSync("siteData.txt", "utf8");
        res.json({
            status: "success",
            dataLength: siteData.length,
            fullContent: siteData, // Show full content for debugging
            hasContent: siteData.length > 100
        });
    } catch (error) {
        res.json({
            status: "error",
            message: error.message
        });
    }
});

// New endpoint to view scraped content in browser
app.get("/view-data", (req, res) => {
    try {
        if (!fs.existsSync("siteData.txt")) {
            return res.send("<h1>No data file found</h1>");
        }

        const siteData = fs.readFileSync("siteData.txt", "utf8");
        const html = `
            <html>
                <head><title>Scraped Website Data</title></head>
                <body style="font-family: Arial; max-width: 800px; margin: 0 auto; padding: 20px;">
                    <h1>Scraped Website Content</h1>
                    <p><strong>Total Length:</strong> ${siteData.length} characters</p>
                    <hr>
                    <div style="white-space: pre-wrap; background: #f5f5f5; padding: 20px; border-radius: 5px;">
                        ${siteData.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
                    </div>
                </body>
            </html>
        `;
        res.send(html);
    } catch (error) {
        res.send(`<h1>Error: ${error.message}</h1>`);
    }
});

// -------------------
// STEP 4: Manual re-scrape endpoint
// -------------------
app.get("/rescrape", async (req, res) => {
    try {
        console.log("🔄 Manual re-scrape requested");
        await scrapeWebsite();
        res.json({
            status: "success",
            message: "Website re-scraped successfully"
        });
    } catch (error) {
        console.error("Re-scrape error:", error);
        res.status(500).json({
            status: "error",
            message: error.message
        });
    }
});

// -------------------
// STEP 5: Enhanced chat endpoint
// -------------------
app.post("/chat", async (req, res) => {
    try {
        const { message } = req.body;

        // Validation
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: "Valid message is required" });
        }

        if (message.length > 500) {
            return res.status(400).json({ error: "Message too long (max 500 characters)" });
        }

        // Check if data file exists
        if (!fs.existsSync("siteData.txt")) {
            console.log("❌ siteData.txt not found during chat request");
            return res.json({
                answer: "I'm still loading website information. Please try again in a moment."
            });
        }

        const siteData = fs.readFileSync("siteData.txt", "utf8");

        // Check if data is sufficient
        if (siteData.length < 100) {
            console.log("❌ Site data too short:", siteData.length, "characters");
            return res.json({
                answer: "I don't have enough website information loaded. Please try again later or contact support."
            });
        }

        console.log(`💬 Processing question: "${message}" (Data: ${siteData.length} chars)`);

        // Enhanced prompt with better instructions
        const prompt = `You are a knowledgeable assistant for Yap Capitalist. Use the website content below to answer questions accurately and specifically.

        WEBSITE CONTENT:
        ${siteData}

     TALK NATURALLY:
        - Be conversational but not overly enthusiastic  
        - Use normal words people actually say
        - Don't be too short or too long
        - If something's unclear, ask naturally like "what do you mean by that?"
        - Share info like you're explaining to a friend
        - Use "yeah", "so", "basically" when it fits naturally
        - Don't sound like customer service or a salesperson

        USER QUESTION: ${message}

        Answer in 1–3 sentences. Make it complete and clear. Do not cut off mid-sentence.
:`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 80
        });

        const answer = completion.choices[0]?.message?.content || "I couldn't generate a response.";
        console.log(`✅ Response generated: ${answer.substring(0, 100)}...`);

        res.json({ answer });

    } 
    catch (err) {
        console.error("Chat error:", err);

        if (err.status === 429) {
            res.status(429).json({
                error: "Too many requests. Please try again in a moment."
            });
        } else if (err.message.includes('API key')) {
            res.status(500).json({
                error: "API configuration error. Please contact support."
            });
        } else {
            res.status(500).json({
                error: "I'm temporarily unavailable. Please try again."
            });
        }
    }
});

// -------------------
// STEP 6: Health check endpoint
// -------------------
app.get("/health", (req, res) => {
    const hasData = fs.existsSync("siteData.txt");
    const dataSize = hasData ? fs.readFileSync("siteData.txt", "utf8").length : 0;

    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        hasData,
        dataSize,
        openaiConfigured: !!process.env.OPENAI_API_KEY
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔧 Debug endpoint: http://localhost:${PORT}/debug`);
    console.log(`🔄 Re-scrape endpoint: http://localhost:${PORT}/rescrape`);
    console.log(`❤️  Health check: http://localhost:${PORT}/health`);
});