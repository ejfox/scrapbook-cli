# Fish completion for scrapbook-cli
# Install: Copy to ~/.config/fish/completions/

# Remove default completions
complete -c scrapbook-cli -e

# Commands
complete -c scrapbook-cli -f -n "__fish_use_subcommand" -a ui -d "Launch interactive TUI (default)"
complete -c scrapbook-cli -f -n "__fish_use_subcommand" -a fzf -d "Browse bookmarks with fzf"
complete -c scrapbook-cli -f -n "__fish_use_subcommand" -a list -d "List all bookmarks in structured format"
complete -c scrapbook-cli -f -n "__fish_use_subcommand" -a search -d "Search bookmarks and output results"
complete -c scrapbook-cli -f -n "__fish_use_subcommand" -a get -d "Get a specific bookmark by ID"
complete -c scrapbook-cli -f -n "__fish_use_subcommand" -a json -d "Display JSON for a specific scrap (legacy)"

# Global options
complete -c scrapbook-cli -s h -l help -d "Display help information"
complete -c scrapbook-cli -s m -l map -d "Display a map of all bookmarks"
complete -c scrapbook-cli -s t -l theme -d "Use a specific theme preset" -r

# ui command
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from ui" -s m -l map -d "Display a map"
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from ui" -s t -l theme -d "Use theme" -r

# fzf command
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from fzf" -s o -l open -d "Open selected bookmark in browser"
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from fzf" -s c -l copy -d "Copy URL to clipboard"
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from fzf" -l field -d "Output specific field" -r -a "url title tags source content summary"

# list command
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from list" -l json -d "Output as JSON array"
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from list" -l jsonl -d "Output as JSON Lines"
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from list" -l tsv -d "Output as TSV"
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from list" -l csv -d "Output as CSV"
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from list" -s l -l limit -d "Limit number of results" -r

# search command
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from search" -l json -d "Output as JSON array"
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from search" -l jsonl -d "Output as JSON Lines"
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from search" -l tsv -d "Output as TSV"
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from search" -l csv -d "Output as CSV"

# get command
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from get" -l json -d "Output as JSON (default)"
complete -c scrapbook-cli -f -n "__fish_seen_subcommand_from get" -s f -l field -d "Extract specific field" -r -a "url title tags source content summary location scrap_id"
