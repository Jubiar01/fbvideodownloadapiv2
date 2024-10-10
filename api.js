const express = require('express');
const axios = require('axios');
const cors = require('cors');
const morgan = require('morgan');
const cache = require('memory-cache');
const userAgent = require('user-agents');
const { parseString } = require('xml2js');
const app = express();

const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the enhanced Facebook Video & Reels Downloader API!' });
});

function isValidFacebookURL(url) {
    const regex = /https?:\/\/(www\.)?facebook\.com\/.*\/(videos|reel|posts|stories)\/.*/;
    return regex.test(url);
}

app.get('/download', async (req, res) => {
    const startTime = Date.now();
    const msg = {};
    const url = req.query.url;
    const format = req.query.format || 'json';

    if (!url) {
        return res.status(400).json({ success: false, message: 'Please provide a Facebook video or reel URL.' });
    }

    if (!isValidFacebookURL(url)) {
        return res.status(400).json({ success: false, message: 'Invalid Facebook video or reel URL.' });
    }

    const cachedResponse = cache.get(url);
    if (cachedResponse) {
        console.log(`Cache hit for URL: ${url}`);
        return respondWithCorrectFormat(res, cachedResponse, format);
    }

    try {
        const headers = {
            'User-Agent': new userAgent().toString(),
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
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9'
        };

        const response = await axios.get(url, { headers });
        const content = response.data;

        msg.success = true;
        msg.id = generateId(url);
        msg.title = sanitizeTitle(getTitle(content));
        msg.author = getAuthor(content);
        msg.published_time = getPublishedTime(content);
        msg.thumbnail = getThumbnail(content);
        msg.links = {};

        const sdLink = getSDLink(content);
        if (sdLink) {
            msg.links['Download SD'] = {
                url: await shortenUrl(sdLink),
                resolution: 'SD',
                size: getFileSize(sdLink)
            };
        }

        const hdLink = getHDLink(content);
        if (hdLink) {
            msg.links['Download HD'] = {
                url: await shortenUrl(hdLink),
                resolution: 'HD',
                size: getFileSize(hdLink)
            };
        }

        if (!sdLink && !hdLink) {
            const genericLink = getGenericVideoLink(content);
            if (genericLink) {
                msg.links['Download Video'] = {
                    url: await shortenUrl(genericLink),
                    resolution: 'Unknown',
                    size: getFileSize(genericLink)
                };
            }
        }

        cache.put(url, msg, 10 * 60 * 1000);
        console.log(`Cache stored for URL: ${url}`);

        respondWithCorrectFormat(res, msg, format);

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
    const match = url.match(/(videos|reel|posts|stories)\/(\d+)/);
    if (match) {
        id = match[2];
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

function getGenericVideoLink(content) {
    const regex = /video_url":"([^"]+)"/;
    const match = content.match(regex);
    return match ? cleanStr(match[1]) : false;
}

function getTitle(content) {
    const match = content.match(/<title>(.*?)<\/title>/) || content.match(/title id="pageTitle">(.+?)<\/title>/);
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

function getThumbnail(content) {
    const regex = /og:image" content="([^"]+)"/;
    const match = content.match(regex);
    return match ? match[1] : 'Unknown';
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
    try {
        const urlObj = new URL(url);
        const fileSizeParam = urlObj.searchParams.get('filesize');
        if (fileSizeParam) {
            const fileSizeInBytes = parseInt(fileSizeParam, 10);
            const fileSizeInKB = Math.round(fileSizeInBytes / 1024);
            return `${fileSizeInKB} KB`;
        }
    } catch (error) {
        console.error('Error getting file size:', error);
    }
    return 'Unknown';
}

function respondWithCorrectFormat(res, data, format) {
    if (format.toLowerCase() === 'xml') {
        parseString(JSON.stringify(data), (err, result) => {
            if (err) {
                console.error('Error converting to XML:', err);
                return res.status(500).json({ success: false, message: 'Error converting to XML' });
            }
            res.set('Content-Type', 'application/xml');
            res.send(result);
        });
    } else {
        res.json(data);
    }
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

module.exports = app;