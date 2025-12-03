#!/usr/bin/env node
/**
 * Import YouTube Watch Later history from CSV into Supabase
 *
 * CSV format: id,title,url
 * Creates scraps with tags based on video titles
 */

import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import config from './config.js';

dotenv.config();

const supabaseUrl = config.database?.supabase_url || process.env.SUPABASE_URL;
const supabaseKey = config.database?.supabase_key || process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Tag patterns for auto-tagging based on title keywords
const TAG_PATTERNS = {
  'tutorial': /tutorial|how to|step by step|guide|beginner/i,
  'watercolor': /watercolor|watercolour/i,
  'pottery': /pottery|ceramic|clay|throwing/i,
  'aftereffects': /after effects/i,
  'animation': /animat/i,
  'cooking': /recipe|cooking|meal prep|breakfast|food/i,
  'design': /design/i,
  'photography': /photo|camera/i,
  'video-editing': /final cut|premiere|editing/i,
  'art': /paint|drawing|artist/i,
  'japanese': /japanese|japan/i,
  'korean': /korean|korea/i,
};

function generateScrapId(url) {
  const hash = crypto.createHash('md5').update(url).digest('hex');
  return `youtube-watchlater-${hash}`;
}

function extractTags(title) {
  const tags = ['youtube', 'watchlater', 'video'];

  for (const [tag, pattern] of Object.entries(TAG_PATTERNS)) {
    if (pattern.test(title)) {
      tags.push(tag);
    }
  }

  return tags;
}

function cleanUrl(url) {
  // Remove list parameters but keep video ID
  const urlObj = new URL(url);
  const videoId = urlObj.searchParams.get('v');
  if (videoId) {
    return `https://youtube.com/watch?v=${videoId}`;
  }
  return url;
}

async function importCSV(csvPath) {
  console.log(`📚 Reading CSV: ${csvPath}`);

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').slice(1); // Skip header

  console.log(`📊 Found ${lines.length} videos to process`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const line of lines) {
    if (!line.trim()) continue;

    // Parse CSV line (handles quoted fields with commas)
    const match = line.match(/^(\d+),"([^"]*)","?([^"]*)"?$/);
    if (!match) {
      console.log(`⚠️  Skipping malformed line: ${line.substring(0, 50)}...`);
      continue;
    }

    const [, id, title, url] = match;
    const cleanedUrl = cleanUrl(url);
    const scrapId = generateScrapId(cleanedUrl);
    const tags = extractTags(title);

    try {
      // Check if already exists
      const { data: existing } = await supabase
        .from('scraps')
        .select('scrap_id')
        .eq('scrap_id', scrapId)
        .single();

      if (existing) {
        skipped++;
        if (skipped % 50 === 0) {
          console.log(`⏭️  Skipped ${skipped} existing videos...`);
        }
        continue;
      }

      // Insert new scrap
      const { error } = await supabase
        .from('scraps')
        .insert({
          scrap_id: scrapId,
          url: cleanedUrl,
          title: title,
          tags: tags,
          source: 'pinboard',
          content_type: 'video',
          created_at: new Date().toISOString(),
        });

      if (error) {
        console.error(`❌ Error inserting ${title}: ${error.message}`);
        errors++;
      } else {
        imported++;
        if (imported % 10 === 0) {
          console.log(`✅ Imported ${imported} videos...`);
        }
      }
    } catch (err) {
      console.error(`❌ Error processing ${title}:`, err.message);
      errors++;
    }
  }

  console.log('\n📊 Import Complete!');
  console.log(`✅ Imported: ${imported}`);
  console.log(`⏭️  Skipped (already exist): ${skipped}`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📚 Total processed: ${imported + skipped + errors}`);

  // Show sample of auto-detected tags
  console.log('\n🏷️  Sample auto-detected tags:');
  console.log('   - Tutorial videos, art tutorials, cooking recipes');
  console.log('   - Watercolor, pottery, animation, photography');
  console.log('   - After Effects, video editing, design');
}

// Run import
const csvPath = process.argv[2] || '/Users/ejfox/Desktop/2024/yt-watchlater-analysis/updated_youtube_videos.csv';
importCSV(csvPath).catch(console.error);
