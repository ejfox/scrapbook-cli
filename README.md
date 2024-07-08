# 🚀 Scrapbook CLI

A cyberpunk-inspired, terminal-based interface for your digital scrapbook. Dive into your memories, search through your digital artifacts, and relive your online adventures - all from the comfort of your command line.

<img width="1902" alt="Screenshot 2024-07-07 at 10 32 56 PM" src="https://github.com/ejfox/scrapbook-cli/assets/530073/4c505956-4fa1-460e-8544-3f81becdc3cb">

<img width="1902" alt="Screenshot 2024-07-07 at 10 32 44 PM" src="https://github.com/ejfox/scrapbook-cli/assets/530073/11378745-d0dd-4987-9076-470180a1a1d3">

## 🌟 Features

- 📚 Browse your entire scrapbook collection
- 🔍 Full-text search across all entries
- 🖥️ Slick, cyberpunk-themed UI
- ⚡ Lightning-fast navigation
- 🔗 Quick-copy links to clipboard
- 🌐 Open entries directly in your browser
- 📊 Visual type indicators for different entry sources

## 🛠️ Installation

```bash
npm install -g scrapbook-cli
```

## 🚀 Usage

To launch the Scrapbook CLI, simply run:

```bash
scrapbook-cli list
```

### 🕹️ Controls

- `↑/↓` or `j/k`: Navigate entries
- `→`: Copy public URL to clipboard
- `←`: Copy entry URL to clipboard
- `Space`: Open entry in browser
- `z`: Toggle full-screen summary view
- `/` or `s`: Search entries
- `r`: Refresh entries
- `Esc`: Exit search or full-screen view
- `q`: Quit

## 🔧 Configuration

Scrapbook CLI uses environment variables for configuration. Create a `.env` file in your home directory with the following:

```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## 📜 License

[MIT](https://choosealicense.com/licenses/mit/)

## 🙏 Acknowledgements

Built with love, caffeine, and a dash of cyberpunk nostalgia. Special thanks to the creators of blessed, blessed-contrib, and Supabase for making this CLI possible.

Remember, in the neon-lit world of digital scrapbooking, you're the protagonist of your own cyberpunk story. Happy scrapping! 🌆💾
