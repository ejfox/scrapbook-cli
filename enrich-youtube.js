#!/usr/bin/env node
/**
 * Enrich YouTube videos with captions + AI summaries
 *
 * Simple flow:
 * 1. Fetch auto-captions with yt-dlp (fast, no download)
 * 2. Parse VTT to clean text
 * 3. Generate summary with Anthropic API
 * 4. Update database
 */

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import config from './config.js';

dotenv.config();

const supabaseUrl = config.database?.supabase_url || process.env.SUPABASE_URL;
const supabaseKey = config.database?.supabase_key || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'youtube-enrich-'));

/**
 * Parse VTT to clean text
 */
function parseVTT(vttContent) {
  const lines = vttContent.split('\n');
  const textLines = [];

  for (const line of lines) {
    // Skip WEBVTT header, Kind, Language, timestamps, and empty lines
    if (line.startsWith('WEBVTT') ||
        line.startsWith('Kind:') ||
        line.startsWith('Language:') ||
        line.match(/^\d{2}:\d{2}/) ||
        line.trim() === '') {
      continue;
    }

    // Remove timing tags like <00:00:01.469>
    const cleaned = line.replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, '')
                        .replace(/<c>/g, '')
                        .replace(/<\/c>/g, '')
                        .trim();

    if (cleaned) {
      textLines.push(cleaned);
    }
  }

  return textLines.join(' ');
}

/**
 * Fetch captions for a video with timeout
 */
async function fetchCaptions(url, videoId) {
  const outputTemplate = path.join(tempDir, `${videoId}.%(ext)s`);

  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      '--write-auto-subs',
      '--skip-download',
      '--sub-format', 'vtt',
      '--sub-langs', 'en',
      '-o', outputTemplate,
      url
    ]);

    let hasError = false;
    let finished = false;

    // 30 second timeout
    const timeout = setTimeout(() => {
      if (!finished) {
        ytdlp.kill();
        resolve(null);
      }
    }, 30000);

    ytdlp.stderr.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('ERROR')) {
        hasError = true;
      }
    });

    ytdlp.on('close', (code) => {
      finished = true;
      clearTimeout(timeout);

      if (hasError || code !== 0) {
        resolve(null); // No captions available
      } else {
        // Find the .vtt file
        const files = fs.readdirSync(tempDir);
        const vttFile = files.find(f => f.endsWith('.vtt') && f.includes(videoId));

        if (vttFile) {
          const vttContent = fs.readFileSync(path.join(tempDir, vttFile), 'utf-8');
          const cleanText = parseVTT(vttContent);
          resolve(cleanText);
        } else {
          resolve(null);
        }
      }
    });
  });
}

/**
 * Generate summary with Claude (Anthropic API)
 */
async function generateSummary(text, title) {
  const prompt = `Summarize this YouTube video transcript. Focus on key concepts, techniques, and main points. Keep it concise (3-5 paragraphs).

Title: ${title}

Transcript:
${text.substring(0, 8000)}`; // Using more context with faster API

  const message = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  return message.content[0].text;
}

/**
 * Extract video ID from URL
 */
function extractVideoId(url) {
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : url.split('/').pop();
}

/**
 * Enrich videos
 */
async function enrichVideos(options = {}) {
  console.log('🎬 YouTube Video Enrichment\n');

  // Find videos without summaries
  const { data: videos, error } = await supabase
    .from('scraps')
    .select('scrap_id, url, title')
    .like('url', '%youtube.com%')
    .is('summary', null)
    .limit(options.limit || 10);

  if (error) {
    console.error('❌ Error fetching videos:', error.message);
    process.exit(1);
  }

  console.log(`📊 Found ${videos.length} videos to enrich\n`);

  let enriched = 0;
  let failed = 0;

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const videoId = extractVideoId(video.url);

    console.log(`\n[${i + 1}/${videos.length}] ${video.title || 'Untitled'}`);
    console.log(`    ${video.url}`);

    try {
      // Fetch captions
      console.log('    📥 Fetching captions...');
      const transcript = await fetchCaptions(video.url, videoId);

      if (!transcript) {
        console.log('    ⚠️  No captions available');
        failed++;
        continue;
      }

      console.log(`    📝 Got ${transcript.length} chars of transcript`);

      // Generate summary
      console.log('    🤖 Generating summary with Claude Haiku...');
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

    // Clean up temp files
    const files = fs.readdirSync(tempDir);
    files.forEach(f => fs.unlinkSync(path.join(tempDir, f)));
  }

  // Cleanup
  fs.rmdirSync(tempDir);

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Enriched: ${enriched}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📚 Total: ${videos.length}`);
}

// CLI
const limit = parseInt(process.argv[2]) || 10;
enrichVideos({ limit }).catch(console.error);
