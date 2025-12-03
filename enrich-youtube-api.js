#!/usr/bin/env node
/**
 * Enrich YouTube videos with captions + AI summaries
 * Docker-friendly version using pure Node.js APIs
 *
 * Dependencies:
 * - youtube-transcript (fetches captions without yt-dlp)
 * - @anthropic-ai/sdk (generates summaries without llm CLI)
 *
 * Just needs: ANTHROPIC_API_KEY environment variable
 */

import { YoutubeTranscript } from 'youtube-transcript';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import config from './config.js';

dotenv.config();

const supabaseUrl = config.database?.supabase_url || process.env.SUPABASE_URL;
const supabaseKey = config.database?.supabase_key || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Extract video ID from URL
 */
function extractVideoId(url) {
  const patterns = [
    /[?&]v=([^&]+)/,           // youtube.com/watch?v=ID
    /youtu\.be\/([^?]+)/,      // youtu.be/ID
    /embed\/([^?]+)/,          // youtube.com/embed/ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Fetch transcript for a video
 */
async function fetchTranscript(videoId) {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    return transcript.map(entry => entry.text).join(' ');
  } catch (err) {
    return null;
  }
}

/**
 * Generate summary with Claude
 */
async function generateSummary(transcript, title) {
  const prompt = `Summarize this YouTube video transcript. Focus on key concepts, techniques, and main points. Keep it concise (3-5 paragraphs).

Title: ${title}

Transcript:
${transcript.substring(0, 8000)}`;

  const message = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  return message.content[0].text;
}

/**
 * Enrich videos
 */
async function enrichVideos(options = {}) {
  console.log('🎬 YouTube Video Enrichment (Docker-friendly)\n');

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Missing ANTHROPIC_API_KEY environment variable');
    process.exit(1);
  }

  // Find videos without summaries
  const { data: videos, error } = await supabase
    .from('scraps')
    .select('scrap_id, url, title')
    .or('url.like.%youtube.com%,url.like.%youtu.be%')
    .is('summary', null)
    .limit(options.limit || 10);

  if (error) {
    console.error('❌ Error fetching videos:', error.message);
    process.exit(1);
  }

  console.log(`📊 Found ${videos.length} videos to enrich\n`);

  let enriched = 0;
  let failed = 0;
  let noTranscript = 0;

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const videoId = extractVideoId(video.url);

    console.log(`\n[${i + 1}/${videos.length}] ${video.title || 'Untitled'}`);
    console.log(`    ${video.url}`);

    if (!videoId) {
      console.log('    ⚠️  Could not extract video ID');
      failed++;
      continue;
    }

    try {
      // Fetch transcript
      console.log('    📥 Fetching transcript...');
      const transcript = await fetchTranscript(videoId);

      if (!transcript) {
        console.log('    ⚠️  No transcript available');
        noTranscript++;
        continue;
      }

      console.log(`    📝 Got ${transcript.length} chars of transcript`);

      // Generate summary
      console.log('    🤖 Generating summary with Claude...');
      const summary = await generateSummary(transcript, video.title);

      // Update database
      const { error: updateError } = await supabase
        .from('scraps')
        .update({
          summary: summary,
          content: transcript.substring(0, 10000) // Store first 10k chars
        })
        .eq('scrap_id', video.scrap_id);

      if (updateError) {
        console.log(`    ❌ Database update failed: ${updateError.message}`);
        failed++;
      } else {
        console.log('    ✅ Enriched!');
        enriched++;
      }

    } catch (err) {
      console.log(`    ❌ Error: ${err.message}`);
      failed++;
    }

    // Rate limit friendly delay
    if (i < videos.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Enriched: ${enriched}`);
  console.log(`   ⏭️  No transcript: ${noTranscript}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📚 Total: ${videos.length}`);
}

// CLI
const limit = parseInt(process.argv[2]) || 10;
enrichVideos({ limit }).catch(console.error);
