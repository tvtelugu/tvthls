// Install: npm install @upstash/redis
import { Redis } from "@upstash/redis";

// Initialize Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const M3U_SOURCE_URL = "https://raw.githubusercontent.com/alex4528/m3u/refs/heads/main/jtv.m3u";

// Handler for both serving content and triggering updates
export default async function handler(req, res) {
  const { channel } = req.query;

  // Manual trigger for testing updates (e.g., /api/channels?update=true)
  if (req.query.update === "true") {
    try {
      const response = await fetch(M3U_SOURCE_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch M3U: ${response.statusText}`);
      }
      const m3uContent = await response.text();
      const lines = m3uContent.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXTINF')) {
          const tvgNameMatch = /,(.+)/.exec(lines[i]);
          const urlMatch = lines[i + 4];
          if (tvgNameMatch && urlMatch) {
            const channelName = tvgNameMatch[1].trim();
            const channelSlug = channelName.toLowerCase().replace(/[^a-z0-9]/g, '');
            await redis.set(channelSlug, urlMatch.trim());
          }
        }
      }
      return res.status(200).json({ message: "Channel list updated successfully." });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // Handle a user request for a specific channel (e.g., /api/channels?channel=disneychannel)
  if (!channel) {
    return res.status(400).json({ error: "Channel parameter is missing." });
  }

  try {
    const streamUrl = await redis.get(channel.toLowerCase());

    if (!streamUrl) {
      return res.status(404).json({ error: "Channel not found." });
    }
    
    // Proxy the request to the stream URL
    const proxyResponse = await fetch(streamUrl, {
      headers: {
        "User-Agent": "plaYtv/7.1.3 (Linux;Android 13) ygx/69.1 ExoPlayerLib/824.0",
        "Cookie": "__hdnea__=st=1757420750~exp=1757507150~acl=/*~hmac=a4bc5017c1034954e2d5894dcf237e937194a1b850bfd51010b3382aa75ecbe1",
      },
    });

    res.setHeader('Content-Type', proxyResponse.headers.get('Content-Type') || 'application/vnd.apple.mpegurl');
    proxyResponse.body.pipe(res);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
