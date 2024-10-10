const express = require('express');
const axios = require('axios');
const cors = require('cors');
const morgan = require('morgan');
const cache = require('memory-cache');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the enhanced Facebook Video & Reels Downloader API!' });
});

function isValidFacebookURL(url) {
    const regex = /https?:\/\/(www\.)?facebook\.com\/.*\/(videos|reels|posts)\/.*/;
    return regex.test(url);
}

app.get('/download', async (req, res) => {
    const startTime = Date.now();
    const msg = {};
    const url = req.query.url;

    if (!url) {
        return res.status(400).json({ success: false, message: 'Please provide a Facebook video or reel URL.' });
    }

    if (!isValidFacebookURL(url)) {
        return res.status(400).json({ success: false, message: 'Invalid Facebook video or reel URL.' });
    }

    const cachedResponse = cache.get(url);
    if (cachedResponse) {
        console.log(`Cache hit for URL: ${url}`);
        return res.json(cachedResponse);
    }

    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
        };

        const response = await axios.get(url, { headers });
        const content = response.data;

        msg.success = true;
        msg.id = generateId(url);
        msg.title = sanitizeTitle(getTitle(content));
        msg.author = getAuthor(content);
        msg.published_time = getPublishedTime(content);
        msg.links = {};

        const sdLink = getSDLink(content);
        if (sdLink) {
            msg.links['Download Low Quality'] = {
                url: await shortenUrl(`${sdLink}&dl=1`),
                resolution: 'SD',
                size: getFileSize(sdLink) // Get estimated file size
            };
        }

        const hdLink = getHDLink(content);
        if (hdLink) {
            msg.links['Download High Quality'] = {
                url: await shortenUrl(`${hdLink}&dl=1`),
                resolution: 'HD',
                size: getFileSize(hdLink) // Get estimated file size
            };
        }

        if (Object.keys(msg.links).length === 0) {
            msg.success = false;
            msg.message = "No download links found. The video might be private or unavailable.";
        }

        cache.put(url, msg, 10 * 60 * 1000);
        console.log(`Cache stored for URL: ${url}`);

        res.json(msg);
    } catch (error) {
        console.error(`Error fetching video: ${error.message}`);
        msg.success = false;
        msg.message = `Error downloading the video or reel. ${error.message}`;
        res.status(500).json(msg);
    } finally {
        const endTime = Date.now();
        console.log(`Request for ${url} took ${endTime - startTime}ms`);
    }
});

function generateId(url) {
    let id = '';
    const match = url.match(/(videos|reels|posts)\/(\d+)/); 
    if (match) {
        id = match[2];
    }
    return id;
}

function cleanStr(str) {
    return JSON.parse(`{"text": "${str}"}`).text;
}

function getSDLink(content) {
    const regex = /sd_src_no_ratelimit:"([^"]+)"/;
    const match = content.match(regex);
    return match ? cleanStr(match[1]) : false;
}

function getHDLink(content) {
    const regex = /hd_src_no_ratelimit:"([^"]+)"/;
    const match = content.match(regex);
    return match ? cleanStr(match[1]) : false;
}

function getTitle(content) {
    const match = content.match(/<title id="pageTitle">(.+?)<\/title>/) 
                || content.match(/<meta property="og:title" content="([^"]+)">/);
    return match ? match[1] : 'Unknown Title';
}

function sanitizeTitle(title) {
    return title.replace(/[^a-zA-Z0-9\s]/g, '').trim();
}

function getAuthor(content) {
    const match = content.match(/"ownerName":"([^"]+)"/);
    return match ? cleanStr(match[1]) : 'Unknown Author';
}

function getPublishedTime(content) {
    const match = content.match(/"publish_time":(\d+)/);
    return match ? new Date(parseInt(match[1], 10) * 1000).toISOString() : 'Unknown';
}

async function shortenUrl(longUrl) {
    try {
        const response = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
        return response.data;
    } catch (error) {
        console.error('Error shortening URL:', error);
        return longUrl;
    }
}

function getFileSize(url) {
    // This is a very basic estimation and may not be accurate
    // You could use a HEAD request to get more accurate content-length
    const match = url.match(/&oh=(\d+)/);
    if (match) {
        const fileSizeInBytes = parseInt(match[1], 16);
        const fileSizeInKB = Math.round(fileSizeInBytes / 1024);
        return `${fileSizeInKB} KB (estimated)`;
    }
    return 'Unknown';
}

module.exports = app;