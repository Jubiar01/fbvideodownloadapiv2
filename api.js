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
    res.json({ message: 'Welcome to the enhanced Facebook Video Downloader API!' });
});

// Helper function to validate Facebook video URLs
function isValidFacebookURL(url) {
    const regex = /https?:\/\/(www\.)?facebook\.com\/.*\/videos\/.*/;
    return regex.test(url);
}

// Download endpoint with more features
app.get('/download', async (req, res) => {
    const msg = {};
    const url = req.query.url;

    // Check if URL is provided
    if (!url) {
        return res.status(400).json({ success: false, message: 'Please provide a Facebook video URL.' });
    }

    // Validate the URL
    if (!isValidFacebookURL(url)) {
        return res.status(400).json({ success: false, message: 'Invalid Facebook video URL.' });
    }

    // Check cache
    const cachedResponse = cache.get(url);
    if (cachedResponse) {
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
        msg.title = getTitle(response.data);
        msg.duration = getDuration(response.data);  // Video duration
        msg.thumbnail = getThumbnail(response.data);  // Video thumbnail

        const sdLink = getSDLink(response.data);
        if (sdLink) {
            msg.links = {
                'Download Low Quality': {
                    url: `${sdLink}&dl=1`,
                    resolution: 'SD',
                    size: 'Unknown' // You could attempt to estimate size based on bitrate
                }
            };
        }

        const hdLink = getHDLink(response.data);
        if (hdLink) {
            msg.links['Download High Quality'] = {
                url: `${hdLink}&dl=1`,
                resolution: 'HD',
                size: 'Unknown'
            };
        }

        // Cache the response for future requests (10 min cache duration)
        cache.put(url, msg, 10 * 60 * 1000);

        res.json(msg);
    } catch (error) {
        msg.success = false;
        msg.message = 'Error downloading the video. ' + error.message;
        res.status(500).json(msg);
    }
});

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
    const regexRateLimit = /browser_native_sd_url":"([^"]+)"/;
    const match = content.match(regexRateLimit);
    return match ? cleanStr(match[1]) : false;
}

function getHDLink(content) {
    const regexRateLimit = /browser_native_hd_url":"([^"]+)"/;
    const match = content.match(regexRateLimit);
    return match ? cleanStr(match[1]) : false;
}

function getTitle(content) {
    let title = null;
    const match = content.match(/<title>(.*?)<\/title>/) || content.match(/title id="pageTitle">(.+?)<\/title>/);
    if (match) {
        title = cleanStr(match[1]);
    }
    return title;
}

// New function to extract video duration from the page content
function getDuration(content) {
    const match = content.match(/"videoDuration":(\d+)/);
    return match ? parseInt(match[1], 10) : 'Unknown';
}

// New function to extract video thumbnail
function getThumbnail(content) {
    const match = content.match(/"thumbnailUrl":"([^"]+)"/);
    return match ? cleanStr(match[1]) : null;
}

// Vercel will use this file as the entry point
module.exports = app;
            
