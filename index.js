// Vaultittech YouTube Dynamic Title Automator
// Production-ready version for Railway deployment
// Fixed to load environment variables at runtime, not build time

const axios = require('axios');

class VaultittechAutomator {
    constructor() {
        // Don't load credentials during construction (build time)
        // This prevents Railway build errors
        this.youtubeApiKey = null;
        this.clientId = null;
        this.clientSecret = null;
        this.refreshToken = null;
        this.channelId = null;
        this.accessToken = null;
        this.accessTokenExpiry = null;
        
        // Performance tracking
        this.stats = {
            updatesPerformed: 0,
            lastUpdate: null,
            peakEngagement: 0
        };
        
        console.log('🚀 Vaultittech YouTube Automator initialized');
    }

    // Load credentials at runtime, not build time
    loadCredentials() {
        console.log('📊 Loading environment variables...');
        
        this.youtubeApiKey = process.env.YOUTUBE_API_KEY;
        this.clientId = process.env.OAUTH_CLIENT_ID;
        this.clientSecret = process.env.OAUTH_CLIENT_SECRET;
        this.refreshToken = process.env.REFRESH_TOKEN;
        this.channelId = process.env.CHANNEL_ID;
        
        // Validate that all required credentials are present
        this.validateEnvironment();
    }

    validateEnvironment() {
        const required = ['YOUTUBE_API_KEY', 'OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET', 'REFRESH_TOKEN'];
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            console.error('❌ Missing environment variables:', missing.join(', '));
            process.exit(1);
        }
        
        console.log('✅ All environment variables loaded successfully');
    }

    async ensureValidAccessToken() {
        const now = Date.now();
        
        if (!this.accessToken || !this.accessTokenExpiry || 
            (this.accessTokenExpiry - now) < 300000) {
            
            await this.refreshAccessToken();
        }
    }

    async refreshAccessToken() {
        try {
            const response = await axios.post('https://oauth2.googleapis.com/token', {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: this.refreshToken,
                grant_type: 'refresh_token'
            });
            
            this.accessToken = response.data.access_token;
            this.accessTokenExpiry = Date.now() + (response.data.expires_in * 1000);
            
            console.log('✅ Access token refreshed successfully');
        } catch (error) {
            console.error('❌ Failed to refresh access token:', error.response?.data || error.message);
            throw error;
        }
    }

    async getVideoStats(videoId) {
        try {
            const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
                params: {
                    key: this.youtubeApiKey,
                    id: videoId,
                    part: 'statistics,snippet'
                }
            });

            if (response.data.items && response.data.items.length > 0) {
                const video = response.data.items[0];
                const stats = {
                    views: parseInt(video.statistics.viewCount) || 0,
                    likes: parseInt(video.statistics.likeCount) || 0,
                    comments: parseInt(video.statistics.commentCount) || 0,
                    currentTitle: video.snippet.title,
                    publishedAt: video.snippet.publishedAt,
                    likeRatio: video.statistics.viewCount > 0 ? 
                        (parseInt(video.statistics.likeCount) || 0) / parseInt(video.statistics.viewCount) : 0,
                    commentRatio: video.statistics.viewCount > 0 ? 
                        (parseInt(video.statistics.commentCount) || 0) / parseInt(video.statistics.viewCount) : 0
                };

                const totalEngagement = stats.likes + stats.comments;
                if (totalEngagement > this.stats.peakEngagement) {
                    this.stats.peakEngagement = totalEngagement;
                }

                return stats;
            } else {
                throw new Error(`Video with ID ${videoId} not found`);
            }
        } catch (error) {
            console.error('❌ Failed to fetch video stats:', error.response?.data || error.message);
            throw error;
        }
    }

    generateDynamicTitle(stats, originalTitle, strategy = 'auto') {
        const views = stats.views.toLocaleString();
        const likes = stats.likes.toLocaleString();
        const comments = stats.comments.toLocaleString();
        
        const templates = {
            detailed: [
                `This video now has ${views} views, ${likes} likes, and ${comments} comments - ${originalTitle}`,
                `${originalTitle} | This video now has ${views} views, ${likes} likes, ${comments} comments`,
                `This video now has ${views} views, ${likes} likes, ${comments} comments: ${originalTitle}`
            ]
        };

        // Always use detailed format
        const selectedCategory = 'detailed';
        const categoryTemplates = templates[selectedCategory];
        const randomTemplate = categoryTemplates[Math.floor(Math.random() * categoryTemplates.length)];
        
        // Ensure title stays within YouTube's 100 character limit
        return randomTemplate.length <= 100 ? randomTemplate : 
            randomTemplate.substring(0, 97) + '...';
    }

    async updateVideoTitle(videoId, newTitle, currentStats) {
        await this.ensureValidAccessToken();

        try {
            const currentVideo = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
                params: {
                    key: this.youtubeApiKey,
                    id: videoId,
                    part: 'snippet'
                }
            });

            if (!currentVideo.data.items || currentVideo.data.items.length === 0) {
                throw new Error(`Video ${videoId} not found for title update`);
            }

            const snippet = currentVideo.data.items[0].snippet;
            
            const updateData = {
                id: videoId,
                snippet: {
                    ...snippet,
                    title: newTitle,
                    categoryId: snippet.categoryId
                }
            };

            await axios.put('https://www.googleapis.com/youtube/v3/videos', updateData, {
                params: { part: 'snippet' },
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`✅ Title updated successfully!`);
            console.log(`📊 Video: ${videoId}`);
            console.log(`📝 New title: "${newTitle}"`);
            console.log(`📈 Stats: ${currentStats.views} views, ${currentStats.likes} likes, ${currentStats.comments} comments`);
            
            this.stats.updatesPerformed++;
            this.stats.lastUpdate = new Date().toISOString();
            
            return true;

        } catch (error) {
            console.error('❌ Failed to update video title:', error.response?.data || error.message);
            
            if (error.response?.status === 401) {
                console.log('🔄 Access token expired, refreshing...');
                await this.refreshAccessToken();
                return this.updateVideoTitle(videoId, newTitle, currentStats);
            }
            
            throw error;
        }
    }

    async processVideo(videoId, originalTitle, strategy = 'auto') {
        try {
            console.log(`\n🎬 Processing Vaultittech video: ${videoId}`);
            
            const stats = await this.getVideoStats(videoId);
            console.log(`📊 Current stats: ${stats.views} views, ${stats.likes} likes, ${stats.comments} comments`);
            
            const newTitle = this.generateDynamicTitle(stats, originalTitle, strategy);
            console.log(`💡 Generated title: "${newTitle}"`);
            
            if (newTitle !== stats.currentTitle) {
                await this.updateVideoTitle(videoId, newTitle, stats);
                console.log('✅ Update completed successfully!');
            } else {
                console.log('📋 Title unchanged, skipping update to preserve API quota');
            }
            
            return {
                success: true,
                videoId,
                oldTitle: stats.currentTitle,
                newTitle,
                stats
            };
            
        } catch (error) {
            console.error(`❌ Failed to process video ${videoId}:`, error.message);
            return {
                success: false,
                videoId,
                error: error.message
            };
        }
    }

    async processMultipleVideos(videos, strategy = 'auto') {
        console.log(`\n🚀 Starting batch processing of ${videos.length} Vaultittech videos...`);
        
        const results = [];
        for (let i = 0; i < videos.length; i++) {
            const { videoId, originalTitle } = videos[i];
            
            console.log(`\n[${i + 1}/${videos.length}] Processing video...`);
            const result = await this.processVideo(videoId, originalTitle, strategy);
            results.push(result);
            
            if (i < videos.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        console.log(`\n📈 Batch Processing Complete!`);
        console.log(`✅ Successful updates: ${successful}`);
        console.log(`❌ Failed updates: ${failed}`);
        console.log(`📊 Total API calls: ${this.stats.updatesPerformed}`);
        
        return results;
    }

    startAutomation(videos, updateInterval = 5, strategy = 'auto') {
        console.log(`\n🔄 Starting Vaultittech YouTube automation...`);
        console.log(`⏱️ Update interval: ${updateInterval} minutes`);
        console.log(`🎯 Strategy: ${strategy}`);
        console.log(`📹 Videos to monitor: ${videos.length}`);
        
        // Run immediately
        this.processMultipleVideos(videos, strategy);
        
        // Schedule regular updates
        const intervalMs = updateInterval * 60 * 1000;
        setInterval(async () => {
            console.log(`\n⏰ Scheduled update starting at ${new Date().toLocaleString()}`);
            await this.processMultipleVideos(videos, strategy);
        }, intervalMs);
        
        console.log(`\n✅ Automation started! Your Vaultittech videos will update every ${updateInterval} minutes.`);
        console.log(`🎯 This system will help drive passive income through increased engagement!`);
    }

    getPerformanceReport() {
        return {
            totalUpdates: this.stats.updatesPerformed,
            lastUpdate: this.stats.lastUpdate,
            peakEngagement: this.stats.peakEngagement,
            uptime: process.uptime(),
            nextUpdate: new Date(Date.now() + 5 * 60 * 1000).toLocaleString()
        };
    }
}

// Configuration from environment variables
const config = {
    videos: [
        {
            videoId: process.env.VIDEO_ID || 'YOUR_VIDEO_ID_HERE',
            originalTitle: process.env.ORIGINAL_TITLE || 'Building Vaultittech: Real-Time Revenue Tracking'
        }
        // Add more videos by setting VIDEO_ID_2, ORIGINAL_TITLE_2, etc.
    ]
};

// Graceful shutdown handling for Railway
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Initialize and start the automation
const automator = new VaultittechAutomator();

// Load credentials at runtime (after build completes)
automator.loadCredentials();

// Start automation with 5-minute intervals
automator.startAutomation(config.videos, 5, 'auto');

// Log performance every hour
setInterval(() => {
    const report = automator.getPerformanceReport();
    console.log('\n📈 Performance Report:', report);
}, 60 * 60 * 1000);
