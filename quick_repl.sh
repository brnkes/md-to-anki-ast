#!/bin/bash -ex

if [ -z "${1}" ]; then
  cd src
  deno repl --import-map=../import_map.json --eval-file=./main.ts
  cd -
fi

if [ "${1}" = "md" ]; then
  cd src
  deno repl --import-map=../import_map.json --eval-file=./process_markdown_note.ts
  cd -
fi