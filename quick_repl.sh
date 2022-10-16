#!/bin/bash -ex

cd src
deno repl --import-map=../import_map.json --eval-file=./main.ts
cd -