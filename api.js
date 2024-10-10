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

// Welcome endpoint
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the advanced Facebook Video & Reels Downloader API!' });
});

// Helper function to validate Facebook video and reel URLs
function isValidFacebookURL(url) {
    const regex = /https?:\/\/(www\.)?facebook\.com\/.*\/(videos|reel)\/.*/;
    return regex.test(url);
}

// Download endpoint with enhanced features
app.get('/download', async (req, res) => {
    const startTime = Date.now();
    const url = req.query.url;

    if (!url) {
        return res.status(400).json({ success: false, message: 'Please provide a Facebook video or reel URL.' });
    }

    if (!isValidFacebookURL(url)) {
        return res.status(400).json({ success: false, message: 'Invalid Facebook video or reel URL.' });
    }

    // Check cache
    const cachedResponse = cache.get(url);
    if (cachedResponse) {
        return res.json(cachedResponse);
    }

    try {
        const headers = {
            'sec-fetch-user': '?1',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.114 Safari/537.36',
        };

        const response = await axios.get(url, { headers });
        const msg = {
            success: true,
            id: generateId(url),
            title: sanitizeTitle(getTitle(response.data)),
            author: getAuthor(response.data),
            published_time: getPublishedTime(response.data),
            description: getDescription(response.data), // New: Video description
            duration: getDuration(response.data), // New: Video duration
            metadata: getVideoMetadata(response.data), // New: Likes, comments, shares for reels
            links: {},
            link_expiry: Date.now() + (6 * 60 * 60 * 1000) // New: Link expiry time (6 hours)
        };

        const sdLink = getSDLink(response.data);
        if (sdLink) {
            msg.links['Download Low Quality'] = {
                url: await shortenUrl(`${sdLink}&dl=1`),
                resolution: 'SD',
                size: 'Unknown'
            };
        }

        const hdLink = getHDLink(response.data);
        if (hdLink) {
            msg.links['Download High Quality'] = {
                url: await shortenUrl(`${hdLink}&dl=1`),
                resolution: 'HD',
                size: 'Unknown'
            };
        }

        // Cache the response (10 min or custom)
        cache.put(url, msg, getCacheDuration(msg));
        res.json(msg);
    } catch (error) {
        res.status(500).json({ success: false, message: `Error: ${error.message}` });
    } finally {
        const endTime = Date.now();
        console.log(`Request took ${endTime - startTime}ms`);
    }
});

// Helper functions

function getCacheDuration(msg) {
    // Custom cache duration: longer for SD, shorter for HD content
    if (msg.links['Download High Quality']) {
        return 5 * 60 * 1000; // 5 minutes
    }
    return 10 * 60 * 1000; // 10 minutes by default
}

function getDescription(content) {
    const regex = /"description":{"text":"([^"]+)"}/;
    const match = content.match(regex);
    return match ? cleanStr(match[1]) : 'No description available';
}

function getDuration(content) {
    const regex = /"video_duration_seconds":(\d+)/;
    const match = content.match(regex);
    if (match) {
        const seconds = parseInt(match[1], 10);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    }
    return 'Unknown duration';
}

function getVideoMetadata(content) {
    const likes = extractData(content, /"reactionCount":(\d+)/);
    const comments = extractData(content, /"commentCount":(\d+)/);
    const shares = extractData(content, /"shareCount":(\d+)/);
    return {
        likes: likes || 0,
        comments: comments || 0,
        shares: shares || 0
    };
}

function extractData(content, regex) {
    const match = content.match(regex);
    return match ? parseInt(match[1], 10) : null;
}

function getPublishedTime(content) {
    const match = content.match(/"publish_time":(\d+)/);
    return match ? new Date(parseInt(match[1], 10) * 1000).toISOString() : 'Unknown';
}

// Remaining helper functions (generateId, cleanStr, getSDLink, getHDLink, etc.) remain the same

module.exports = app;
