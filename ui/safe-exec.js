import { spawn } from "child_process";

/**
 * Safely open a URL in the default browser
 * @param {string} url - The URL to open
 * @returns {Promise<void>}
 */
export function openUrl(url) {
  return new Promise((resolve, reject) => {
    if (!url || typeof url !== 'string') {
      reject(new Error('Invalid URL'));
      return;
    }

    // Detect platform
    const platform = process.platform;
    let command;
    let args;

    if (platform === 'darwin') {
      command = 'open';
      args = [url];
    } else if (platform === 'win32') {
      command = 'cmd.exe';
      args = ['/c', 'start', '""', url];
    } else {
      // Linux
      command = 'xdg-open';
      args = [url];
    }

    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore'
    });

    child.on('error', reject);
    child.unref();
    resolve();
  });
}

/**
 * Safely copy text to clipboard
 * @param {string} text - The text to copy
 * @returns {Promise<void>}
 */
export function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    if (!text || typeof text !== 'string') {
      reject(new Error('Invalid text'));
      return;
    }

    const platform = process.platform;
    let command;
    let args;

    if (platform === 'darwin') {
      command = 'pbcopy';
      args = [];
    } else if (platform === 'win32') {
      command = 'clip';
      args = [];
    } else {
      // Linux - try xclip first, then xsel
      command = 'xclip';
      args = ['-selection', 'clipboard'];
    }

    const child = spawn(command, args);

    child.on('error', (err) => {
      if (platform === 'linux' && command === 'xclip') {
        // Fallback to xsel on Linux if xclip fails
        const fallbackChild = spawn('xsel', ['--clipboard', '--input']);
        fallbackChild.on('error', reject);
        fallbackChild.stdin.write(text);
        fallbackChild.stdin.end();
        fallbackChild.on('close', resolve);
      } else {
        reject(err);
      }
    });

    child.on('close', resolve);

    // Write the text to stdin
    child.stdin.write(text);
    child.stdin.end();
  });
}