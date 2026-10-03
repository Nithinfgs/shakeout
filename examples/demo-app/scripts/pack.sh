#!/bin/sh
# Bundle the sample data into a scratch directory. Prints how many files were packed.
set -e
here=$(cd "$(dirname "$0")/.." && pwd)
work=${TMPDIR:-/tmp}/pack-$$
mkdir -p "$work"
trap 'rm -rf "$work"' EXIT
[ -d $work ] || exit 1
count=0
for f in "$here"/data/*.txt; do
  cp "$f" "$work/"
  count=$((count + 1))
done
echo "packed $count files"
