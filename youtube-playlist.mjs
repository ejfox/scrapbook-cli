#!/usr/bin/env node

/**
 * YouTube Playlist Generator for scrapbook-cli
 *
 * Creates yt-dlp compatible playlists from YouTube bookmarks filtered by:
 * - Tags
 * - Entities (from knowledge graph)
 * - Date ranges
 * - Search queries
 *
 * Features:
 * - Generate .txt playlist files for yt-dlp
 * - Optional: Download with yt-dlp directly
 * - Optional: Transcribe with Whisper
 * - Group by tags/entities for themed video essays
 *
 * Usage:
 *   node youtube-playlist.mjs --tag "AI" --tag "machine learning"
 *   node youtube-playlist.mjs --entity "OpenAI"
 *   node youtube-playlist.mjs --search "autonomous vehicles" --download
 *   node youtube-playlist.mjs --entity "Palantir" --transcribe
 */

import { Command } from 'commander';
import { loadBookmarks } from './database.js';
import { queryByEntity } from './database.js';
import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';

const program = new Command();

program
  .name('youtube-playlist')
  .description('Generate yt-dlp playlists from YouTube bookmarks')
  .version('1.0.0');

program
  .command('generate')
  .description('Generate playlist file')
  .option('--tag <tags...>', 'Filter by tags')
  .option('--entity <entity>', 'Filter by entity from knowledge graph')
  .option('--search <query>', 'Search in titles/descriptions')
  .option('--after <date>', 'Only videos after date (YYYY-MM-DD)')
  .option('--before <date>', 'Only videos before date (YYYY-MM-DD)')
  .option('-o, --output <file>', 'Output playlist file', 'playlist.txt')
  .option('--format <format>', 'Output format: txt, json, m3u', 'txt')
  .action(async (options) => {
    console.log('📚 Loading bookmarks...');
    let bookmarks = await loadBookmarks();

    // Filter to YouTube only
    bookmarks = bookmarks.filter(b =>
      b.url && (
        b.url.includes('youtube.com') ||
        b.url.includes('youtu.be') ||
        b.source === 'youtube'
      )
    );

    console.log(`🎥 Found ${bookmarks.length} YouTube bookmarks`);

    // Apply filters
    if (options.entity) {
      console.log(`🔍 Filtering by entity: ${options.entity}`);
      const entityData = await queryByEntity(options.entity);
      const scrapIds = new Set(entityData.scraps.map(s => s.scrap_id));
      bookmarks = bookmarks.filter(b => scrapIds.has(b.scrap_id));
      console.log(`   Found ${bookmarks.length} videos mentioning "${options.entity}"`);
    }

    if (options.tag && options.tag.length > 0) {
      console.log(`🏷️  Filtering by tags: ${options.tag.join(', ')}`);
      bookmarks = bookmarks.filter(b =>
        b.tags && options.tag.some(tag =>
          b.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
        )
      );
      console.log(`   Found ${bookmarks.length} videos with matching tags`);
    }

    if (options.search) {
      console.log(`🔎 Searching for: ${options.search}`);
      const query = options.search.toLowerCase();
      bookmarks = bookmarks.filter(b =>
        (b.title && b.title.toLowerCase().includes(query)) ||
        (b.summary && b.summary.toLowerCase().includes(query)) ||
        (b.content && b.content.toLowerCase().includes(query))
      );
      console.log(`   Found ${bookmarks.length} videos matching search`);
    }

    if (options.after) {
      const afterDate = new Date(options.after);
      bookmarks = bookmarks.filter(b => new Date(b.created_at) > afterDate);
      console.log(`   Found ${bookmarks.length} videos after ${options.after}`);
    }

    if (options.before) {
      const beforeDate = new Date(options.before);
      bookmarks = bookmarks.filter(b => new Date(b.created_at) < beforeDate);
      console.log(`   Found ${bookmarks.length} videos before ${options.before}`);
    }

    if (bookmarks.length === 0) {
      console.log('❌ No videos found matching criteria');
      process.exit(1);
    }

    // Generate playlist
    const outputPath = path.resolve(options.output);

    if (options.format === 'txt') {
      // yt-dlp compatible format (one URL per line)
      const playlist = bookmarks.map(b => b.url).join('\n');
      fs.writeFileSync(outputPath, playlist);
    } else if (options.format === 'json') {
      // Full metadata export
      const playlist = bookmarks.map(b => ({
        url: b.url,
        title: b.title,
        summary: b.summary,
        tags: b.tags,
        created_at: b.created_at,
        scrap_id: b.scrap_id
      }));
      fs.writeFileSync(outputPath, JSON.stringify(playlist, null, 2));
    } else if (options.format === 'm3u') {
      // M3U playlist format
      let m3u = '#EXTM3U\n';
      bookmarks.forEach(b => {
        m3u += `#EXTINF:-1,${b.title || 'Untitled'}\n`;
        m3u += `${b.url}\n`;
      });
      fs.writeFileSync(outputPath, m3u);
    }

    console.log(`\n✅ Playlist saved to: ${outputPath}`);
    console.log(`📊 Total videos: ${bookmarks.length}`);

    // Print sample
    console.log('\n📹 Sample videos:');
    bookmarks.slice(0, 5).forEach((b, i) => {
      console.log(`   ${i + 1}. ${b.title || 'Untitled'}`);
      console.log(`      ${b.url}`);
    });

    if (bookmarks.length > 5) {
      console.log(`   ... and ${bookmarks.length - 5} more`);
    }

    // Print yt-dlp command
    console.log('\n💡 To download with yt-dlp:');
    console.log(`   yt-dlp -a ${outputPath}`);
    console.log('\n💡 To download with subtitles:');
    console.log(`   yt-dlp -a ${outputPath} --write-auto-sub --sub-lang en`);
  });

program
  .command('download')
  .description('Generate playlist and download with yt-dlp')
  .option('--tag <tags...>', 'Filter by tags')
  .option('--entity <entity>', 'Filter by entity')
  .option('--search <query>', 'Search query')
  .option('-o, --output-dir <dir>', 'Download directory', './youtube-downloads')
  .option('--audio-only', 'Download audio only')
  .option('--subs', 'Download subtitles')
  .action(async (options) => {
    // Generate playlist first
    const playlistFile = `/tmp/scrapbook-playlist-${Date.now()}.txt`;

    console.log('📚 Loading and filtering bookmarks...');
    let bookmarks = await loadBookmarks();

    // Filter to YouTube
    bookmarks = bookmarks.filter(b =>
      b.url && (b.url.includes('youtube.com') || b.url.includes('youtu.be'))
    );

    // Apply same filters as generate command
    if (options.entity) {
      const entityData = await queryByEntity(options.entity);
      const scrapIds = new Set(entityData.scraps.map(s => s.scrap_id));
      bookmarks = bookmarks.filter(b => scrapIds.has(b.scrap_id));
    }

    if (options.tag) {
      bookmarks = bookmarks.filter(b =>
        b.tags && options.tag.some(tag =>
          b.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
        )
      );
    }

    if (options.search) {
      const query = options.search.toLowerCase();
      bookmarks = bookmarks.filter(b =>
        (b.title && b.title.toLowerCase().includes(query)) ||
        (b.summary && b.summary.toLowerCase().includes(query))
      );
    }

    if (bookmarks.length === 0) {
      console.log('❌ No videos found');
      process.exit(1);
    }

    // Save playlist
    const playlist = bookmarks.map(b => b.url).join('\n');
    fs.writeFileSync(playlistFile, playlist);

    console.log(`\n✅ Found ${bookmarks.length} videos`);
    console.log(`📥 Downloading to: ${options.outputDir}\n`);

    // Ensure output directory exists
    if (!fs.existsSync(options.outputDir)) {
      fs.mkdirSync(options.outputDir, { recursive: true });
    }

    // Build yt-dlp command
    const ytDlpArgs = [
      '-a', playlistFile,
      '-o', `${options.outputDir}/%(title)s.%(ext)s`,
      '--progress'
    ];

    if (options.audioOnly) {
      ytDlpArgs.push('-x', '--audio-format', 'mp3');
    }

    if (options.subs) {
      ytDlpArgs.push('--write-auto-sub', '--sub-lang', 'en');
    }

    // Spawn yt-dlp
    const ytDlp = spawn('yt-dlp', ytDlpArgs, { stdio: 'inherit' });

    ytDlp.on('close', (code) => {
      fs.unlinkSync(playlistFile);
      if (code === 0) {
        console.log('\n✅ Download complete!');
      } else {
        console.log(`\n❌ Download failed with code ${code}`);
      }
      process.exit(code);
    });
  });

program
  .command('transcribe')
  .description('Download and transcribe videos with Whisper')
  .option('--entity <entity>', 'Filter by entity')
  .option('--tag <tags...>', 'Filter by tags')
  .option('--search <query>', 'Search query')
  .option('-o, --output-dir <dir>', 'Output directory', './transcriptions')
  .option('--model <model>', 'Whisper model (tiny, base, small, medium, large)', 'base')
  .option('--keep-audio', 'Keep downloaded audio files')
  .action(async (options) => {
    console.log('🎙️  YouTube Transcription Pipeline\n');

    // Load and filter bookmarks
    let bookmarks = await loadBookmarks();
    bookmarks = bookmarks.filter(b =>
      b.url && (b.url.includes('youtube.com') || b.url.includes('youtu.be'))
    );

    if (options.entity) {
      const entityData = await queryByEntity(options.entity);
      const scrapIds = new Set(entityData.scraps.map(s => s.scrap_id));
      bookmarks = bookmarks.filter(b => scrapIds.has(b.scrap_id));
    }

    if (options.tag) {
      bookmarks = bookmarks.filter(b =>
        b.tags && options.tag.some(tag =>
          b.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))
        )
      );
    }

    if (options.search) {
      const query = options.search.toLowerCase();
      bookmarks = bookmarks.filter(b =>
        (b.title && b.title.toLowerCase().includes(query)) ||
        (b.summary && b.summary.toLowerCase().includes(query))
      );
    }

    console.log(`✅ Found ${bookmarks.length} videos to transcribe\n`);

    if (bookmarks.length === 0) {
      console.log('❌ No videos found');
      process.exit(1);
    }

    // Ensure output directory
    if (!fs.existsSync(options.outputDir)) {
      fs.mkdirSync(options.outputDir, { recursive: true });
    }

    // Process each video
    for (let i = 0; i < bookmarks.length; i++) {
      const video = bookmarks[i];
      console.log(`\n[${i + 1}/${bookmarks.length}] ${video.title || 'Untitled'}`);
      console.log(`    ${video.url}`);

      const safeTitle = (video.title || `video-${i}`)
        .replace(/[^a-z0-9]/gi, '-')
        .substring(0, 50);
      const audioFile = path.join(options.outputDir, `${safeTitle}.mp3`);
      const transcriptFile = path.join(options.outputDir, `${safeTitle}.txt`);

      // Check if already transcribed
      if (fs.existsSync(transcriptFile)) {
        console.log('    ⏭️  Already transcribed, skipping');
        continue;
      }

      // Download audio
      console.log('    📥 Downloading audio...');
      await new Promise((resolve, reject) => {
        const ytDlp = spawn('yt-dlp', [
          video.url,
          '-x',
          '--audio-format', 'mp3',
          '-o', audioFile,
          '--quiet'
        ]);

        ytDlp.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`yt-dlp failed with code ${code}`));
        });
      });

      // Transcribe with Whisper
      console.log('    🎙️  Transcribing with Whisper...');
      await new Promise((resolve, reject) => {
        const whisper = spawn('whisper', [
          audioFile,
          '--model', options.model,
          '--output_format', 'txt',
          '--output_dir', options.outputDir
        ], { stdio: 'inherit' });

        whisper.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Whisper failed with code ${code}`));
        });
      });

      // Clean up audio if requested
      if (!options.keepAudio && fs.existsSync(audioFile)) {
        fs.unlinkSync(audioFile);
      }

      console.log(`    ✅ Saved to: ${transcriptFile}`);
    }

    console.log(`\n✅ Transcription complete! ${bookmarks.length} videos processed.`);
    console.log(`📁 Transcripts saved to: ${options.outputDir}/`);
  });

// Stats command - analyze your YouTube collection
program
  .command('stats')
  .description('Analyze YouTube bookmarks statistics')
  .action(async () => {
    console.log('📊 YouTube Collection Statistics\n');

    const bookmarks = await loadBookmarks();
    const youtube = bookmarks.filter(b =>
      b.url && (b.url.includes('youtube.com') || b.url.includes('youtu.be'))
    );

    console.log(`Total YouTube videos: ${youtube.length}`);

    // Tag frequency
    const tagCounts = {};
    youtube.forEach(b => {
      if (b.tags) {
        b.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    console.log('\n🏷️  Top 10 Tags:');
    topTags.forEach(([tag, count]) => {
      console.log(`   ${tag.padEnd(30)} ${count} videos`);
    });

    // Videos by year
    const byYear = {};
    youtube.forEach(b => {
      const year = new Date(b.created_at).getFullYear();
      byYear[year] = (byYear[year] || 0) + 1;
    });

    console.log('\n📅 Videos by Year:');
    Object.entries(byYear)
      .sort((a, b) => a[0] - b[0])
      .forEach(([year, count]) => {
        console.log(`   ${year}: ${count} videos`);
      });
  });

program.parse(process.argv);
