const express = require('express');
const axios = require('axios');
const cors = require('cors');
const morgan = require('morgan');
const cache = require('memory-cache');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());  // Enable CORS for all routes
app.use(express.json());
app.use(morgan('combined'));  // Log all requests

// Welcome endpoint
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the enhanced Facebook Video & Reels Downloader API!' });
});

// Helper function to validate Facebook video and reel URLs
function isValidFacebookURL(url) {
    const regex = /https?:\/\/(www\.)?facebook\.com\/.*\/(videos|reel)\/.*/;
    return regex.test(url);
}

// Download endpoint with more features
app.get('/download', async (req, res) => {
    const startTime = Date.now(); // Start timing the request
    const msg = {};
    const url = req.query.url;

    // Check if URL is provided
    if (!url) {
        return res.status(400).json({ success: false, message: 'Please provide a Facebook video or reel URL.' });
    }

    // Validate the URL (supports both regular videos and reels)
    if (!isValidFacebookURL(url)) {
        return res.status(400).json({ success: false, message: 'Invalid Facebook video or reel URL.' });
    }

    // Check cache
    const cachedResponse = cache.get(url);
    if (cachedResponse) {
        console.log(`Cache hit for URL: ${url}`);
        return res.json(cachedResponse);
    }

    try {
        const headers = {
            'sec-fetch-user': '?1',
            'sec-ch-ua-mobile': '?0',
            'sec-fetch-site': 'none',
            'sec-fetch-dest': 'document',
            'sec-fetch-mode': 'navigate',
            'cache-control': 'max-age=0',
            'authority': 'www.facebook.com',
            'upgrade-insecure-requests': '1',
            'accept-language': 'en-GB,en;q=0.9,tr-TR;q=0.8,tr;q=0.7,en-US;q=0.6',
            'sec-ch-ua': '"Google Chrome";v="89", "Chromium";v="89", ";Not A Brand";v="99"',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9'
        };

        const response = await axios.get(url, { headers });

        msg.success = true;
        msg.id = generateId(url);
        msg.title = sanitizeTitle(getTitle(response.data));
        msg.author = getAuthor(response.data); // New: Author name
        msg.published_time = getPublishedTime(response.data); // New: Published time

        const sdLink = getSDLink(response.data);
        if (sdLink) {
            msg.links = {
                'Download Low Quality': {
                    url: await shortenUrl(`${sdLink}&dl=1`), // Shortened download link
                    resolution: 'SD',
                    size: 'Unknown'
                }
            };
        }

        const hdLink = getHDLink(response.data);
        if (hdLink) {
            msg.links['Download High Quality'] = {
                url: await shortenUrl(`${hdLink}&dl=1`), // Shortened download link
                resolution: 'HD',
                size: 'Unknown'
            };
        }

        // Cache the response for future requests (10 min cache duration)
        cache.put(url, msg, 10 * 60 * 1000);
        console.log(`Cache stored for URL: ${url}`);

        res.json(msg);
    } catch (error) {
        console.error(`Error fetching video: ${error.message}`);
        msg.success = false;
        msg.message = `Error downloading the video or reel. ${error.message}`;
        res.status(500).json(msg);
    } finally {
        const endTime = Date.now(); // End timing the request
        console.log(`Request for ${url} took ${endTime - startTime}ms`);
    }
});

// Helper functions

function generateId(url) {
    let id = '';
    const match = url.match(/(\d+)\/?$/);
    if (match) {
        id = match[1];
    }
    return id;
}

function cleanStr(str) {
    return JSON.parse(`{"text": "${str}"}`).text;
}

function getSDLink(content) {
    const regex = /browser_native_sd_url":"([^"]+)"/;
    const match = content.match(regex);
    return match ? cleanStr(match[1]) : false;
}

function getHDLink(content) {
    const regex = /browser_native_hd_url":"([^"]+)"/;
    const match = content.match(regex);
    return match ? cleanStr(match[1]) : false;
}

function getTitle(content) {
    const match = content.match(/<title>(.*?)<\/title>/) || content.match(/title id="pageTitle">(.+?)<\/title>/);
    return match ? match[1] : 'Unknown Title';
}

// New function to sanitize video titles
function sanitizeTitle(title) {
    return title.replace(/[^a-zA-Z0-9\s]/g, '').trim();
}

// New function to extract the video author
function getAuthor(content) {
    const match = content.match(/"ownerName":"([^"]+)"/);
    return match ? cleanStr(match[1]) : 'Unknown Author';
}

// New function to extract the published time
function getPublishedTime(content) {
    const match = content.match(/"publish_time":(\d+)/);
    return match ? new Date(parseInt(match[1], 10) * 1000).toISOString() : 'Unknown';
}

// New function to shorten download links
async function shortenUrl(longUrl) {
    try {
        const response = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
        return response.data;
    } catch (error) {
        console.error('Error shortening URL:', error);
        return longUrl; // Fallback to the original URL if shortening fails
    }
}

// Vercel will use this file as the entry point
module.exports = app;
