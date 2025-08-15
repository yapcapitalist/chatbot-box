import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import cors from "cors";

const DATA_FILE = "siteData.txt"; 

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors({
    origin: ['http://localhost:5173',
    'https://www.yapcapitalist.com',
    'https://chatbot-box.onrender.com',
    'https://chatbot-box-production.up.railway.app'], // Add your Railway domain here
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

// Helper function to ensure directory exists
function ensureDirectoryExists(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        console.log(`📁 Creating directory: ${dir}`);
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Helper function to write file safely
function writeFileSync(filePath, content) {
    try {
        ensureDirectoryExists(filePath);
        fs.writeFileSync(filePath, content, "utf8");
        console.log(`✅ File written successfully: ${filePath}`);
    } catch (error) {
        console.error(`❌ Error writing file ${filePath}:`, error.message);
        throw error;
    }
}

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

    // Add some fallback content if scraping fails
    if (scrapedText.length < 100) {
        scrapedText = `
=== YAP CAPITALIST INFORMATION ===

Yap Capitalist is a platform focused on helping entrepreneurs and business owners.

Key Services:
- Business consulting and advisory services
- Investment opportunities and guidance  
- Educational webinars and training programs
- Application process for business opportunities

Contact and Applications:
- Main website: https://www.yapcapitalist.com/
- Apply for services: https://www.yapcapitalist.com/apply
- Join webinars: https://www.yapcapitalist.com/webinar
- Application form: https://www.yapcapitalist.com/application-form

This platform appears to focus on business growth, investment strategies, and entrepreneurial development.
        `.trim();
    }

    // Use the safe write function
    writeFileSync(DATA_FILE, scrapedText);
    console.log(`✅ Content prepared! Manual content + ${successCount}/${pages.length} scraped pages`);
    console.log(`📁 Total content: ${scrapedText.length} characters saved to ${DATA_FILE}`);
}

// -------------------
// STEP 2: ENHANCED Initialize scraping (Railway optimized)
// -------------------
async function initializeData() {
    try {
        console.log(`🔍 Checking for data file: ${DATA_FILE}`);
        
        // Check if we have a committed siteData.txt file
        if (fs.existsSync(DATA_FILE)) {
            const existingData = fs.readFileSync(DATA_FILE, "utf8");
            const stats = fs.statSync(DATA_FILE);
            
            console.log(`📂 Found existing siteData.txt: ${existingData.length} characters`);
            console.log(`📅 File last modified: ${stats.mtime}`);

            // If file has good content, use it (prioritize committed data)
            if (existingData.length > 100) {
                console.log("✅ Using existing siteData.txt from repository");
                return; // Use the committed file - this makes it FAST!
            } else {
                console.log("⚠️  Existing data too small, will scrape...");
            }
        } else {
            console.log("📂 siteData.txt not found, will scrape website...");
        }
        
        // Only scrape if no valid committed file exists
        await scrapeWebsite();
        
    } catch (error) {
        console.error("❌ Error initializing data:", error.message);
        // Create fallback content as last resort
        const fallbackContent = `
=== YAP CAPITALIST - FALLBACK DATA ===
Yap Capitalist - Business consulting and investment platform.
Visit https://www.yapcapitalist.com/ for more information.
        `.trim();
        writeFileSync(DATA_FILE, fallbackContent);
    }
}

// Initialize data on startup
initializeData().catch(console.error);

// -------------------
// STEP 3: Enhanced Debug endpoint with file info
// -------------------
app.get("/debug", (req, res) => {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return res.json({
                status: "error",
                message: "DATA_FILE not found",
                dataFile: DATA_FILE
            });
        }

        const siteData = fs.readFileSync(DATA_FILE, "utf8");
        const stats = fs.statSync(DATA_FILE);
        const now = new Date();
        const fileAge = Math.floor((now - stats.mtime) / (1000 * 60)); // minutes
        
        res.json({
            status: "success",
            dataFile: DATA_FILE,
            dataLength: siteData.length,
            lastModified: stats.mtime,
            fileAgeMinutes: fileAge,
            isRecentFile: fileAge < 10, // File is less than 10 minutes old
            hasContent: siteData.length > 100,
            preview: siteData.substring(0, 500) + "...",
            platform: "Railway" // Helpful for debugging
        });
    } catch (error) {
        res.json({
            status: "error",
            message: error.message,
            dataFile: DATA_FILE
        });
    }
});

// New endpoint to view scraped content in browser
app.get("/view-data", (req, res) => {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return res.send(`<h1>No data file found at: ${DATA_FILE}</h1>`);
        }

        const siteData = fs.readFileSync(DATA_FILE, "utf8");
        const stats = fs.statSync(DATA_FILE);
        
        const html = `
            <html>
                <head><title>Scraped Website Data</title></head>
                <body style="font-family: Arial; max-width: 800px; margin: 0 auto; padding: 20px;">
                    <h1>Scraped Website Content</h1>
                    <p><strong>File Path:</strong> ${DATA_FILE}</p>
                    <p><strong>Total Length:</strong> ${siteData.length} characters</p>
                    <p><strong>Last Modified:</strong> ${stats.mtime}</p>
                    <p><strong>Platform:</strong> Railway</p>
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
// STEP 4: Enhanced manual re-scrape endpoint
// -------------------
app.get("/rescrape", async (req, res) => {
    try {
        console.log("🔄 Manual re-scrape requested");
        await scrapeWebsite();
        
        // Get updated file info
        const stats = fs.statSync(DATA_FILE);
        const siteData = fs.readFileSync(DATA_FILE, "utf8");
        
        res.json({
            status: "success",
            message: "Website re-scraped successfully",
            dataFile: DATA_FILE,
            dataLength: siteData.length,
            lastUpdated: stats.mtime,
            timestamp: new Date().toISOString()
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
// NEW: Force refresh endpoint (useful for Railway deployments)
// -------------------
app.get("/force-refresh", async (req, res) => {
    try {
        console.log("🔄 Force refresh requested - will re-scrape regardless of existing data");
        
        // Delete existing file first
        if (fs.existsSync(DATA_FILE)) {
            fs.unlinkSync(DATA_FILE);
            console.log("🗑️  Deleted existing siteData.txt");
        }
        
        // Force scrape
        await scrapeWebsite();
        
        const stats = fs.statSync(DATA_FILE);
        const siteData = fs.readFileSync(DATA_FILE, "utf8");
        
        res.json({
            status: "success",
            message: "Force refresh completed - fresh data scraped",
            dataLength: siteData.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Force refresh error:", error);
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
        if (!fs.existsSync(DATA_FILE)) {
            console.log("❌ siteData.txt not found during chat request");
            return res.json({
                answer: "I'm still loading website information. Please try again in a moment."
            });
        }

        const siteData = fs.readFileSync(DATA_FILE, "utf8");

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

        Answer in 1–3 sentences. Make it complete and clear. Do not cut off mid-sentence.`;

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
// STEP 6: Enhanced Health check endpoint
// -------------------
app.get("/health", (req, res) => {
    const hasData = fs.existsSync(DATA_FILE);
    let dataSize = 0;
    let fileAge = null;
    
    if (hasData) {
        dataSize = fs.readFileSync(DATA_FILE, "utf8").length;
        const stats = fs.statSync(DATA_FILE);
        fileAge = Math.floor((new Date() - stats.mtime) / (1000 * 60)); // minutes
    }

    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        platform: "Railway",
        dataFile: DATA_FILE,
        hasData,
        dataSize,
        fileAgeMinutes: fileAge,
        openaiConfigured: !!process.env.OPENAI_API_KEY,
        environment: process.env.NODE_ENV || 'development'
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🚂 Platform: Railway`);
    console.log(`📁 Data file location: ${DATA_FILE}`);
    console.log(`🔧 Debug endpoint: http://localhost:${PORT}/debug`);
    console.log(`👀 View data: http://localhost:${PORT}/view-data`);
    console.log(`🔄 Re-scrape endpoint: http://localhost:${PORT}/rescrape`);
    console.log(`⚡ Force refresh: http://localhost:${PORT}/force-refresh`);
    console.log(`❤️  Health check: http://localhost:${PORT}/health`);
});