const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Welcome endpoint
app.get('/welcome', (req, res) => {
    res.json({ message: 'Welcome to the Facebook Video Downloader API!' });
});

// Download endpoint using POST method
app.post('/download', async (req, res) => {
    const msg = {};
    const url = req.body.url; // Use req.body to get the URL from the POST request

    try {
        if (!url) {
            throw new Error('Please provide the URL');
        }

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

        const sdLink = getSDLink(response.data);
        if (sdLink) {
            msg.links = {
                'Download Low Quality': `${sdLink}&dl=1`
            };
        }

        const hdLink = getHDLink(response.data);
        if (hdLink) {
            msg.links['Download High Quality'] = `${hdLink}&dl=1`;
        }

        res.json(msg);
    } catch (error) {
        msg.success = false;
        msg.message = error.message;
        res.json(msg);
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

// Vercel will use this file as the entry point
module.exports = app;
