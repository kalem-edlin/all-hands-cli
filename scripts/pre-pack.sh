#!/bin/bash
# Pre-pack script: Rename dotfiles that npm hardcode-excludes
# Run this in CI before `npm pack`
# Only targets .claude/ directory (what we distribute)

set -e

DOTFILES=(".gitignore" ".npmrc" ".npmignore")

for dotfile in "${DOTFILES[@]}"; do
  nodot="${dotfile#.}"

  # Only rename within .claude/, excluding node_modules
  # Use /usr/bin/find to avoid fd alias
  /usr/bin/find .claude -name "$dotfile" \
    -not -path "*/node_modules/*" \
    -type f | while read -r file; do
    dir=$(dirname "$file")
    newname="$dir/$nodot"
    echo "Renaming: $file -> $newname"
    mv "$file" "$newname"
  done
done

echo "Pre-pack dotfile rename complete"
