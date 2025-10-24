#!/bin/bash

mkdir -p ./outputs

for f in ./tests/*.ttal
do
	echo "Processing $f"
	echo " Converting to DAPT"
	node ttal2dapt.js $f ./outputs/`basename $f`.xml # Add any needed flags on this line, such as --no-styles, --no-layout, --no-nflx, --sort, etc.
	#run-tests.sh --disable-warnings --model imsc11 ./outputs/`basename $f`.xml
	read -p "...done ($f). Press key for next file"
done
