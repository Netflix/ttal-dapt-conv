# ttal-dapt-conv

ttal-dapt-conv provides a JavaScript tool to convert Netflix Timed Text Authoring Lineage (TTAL) format to Dubbing and Audio description Profiles of TTML2 (DAPT).

TTAL is a authoring specification developed by Netflix, and implemented in 3rd party tools for script exchange. The current/supported version of TTAL is v1.1 (October, 2022). Learn more about TTAL here:

https://netflixtechblog.com/introducing-netflix-timed-text-authoring-lineage-6fb57b72ad41

DAPT is a draft W3C specification that introduces a TTML-based file format for the exchange of timed text content in transcription and translation workflows. Learn more about DAPT here:

https://w3c.github.io/dapt/

## Dependencies

ttal-dapt-conv requires additional JavaScript modules. To install, run the following command inside the project folder:

```
npm install
```

Instructions to install/setup npm are available online.

## Usage

After installing the dependencies, run the follwoing command to convert a TTAL file to DAPT:

```
node ttal2dapt.js input.ttal output.xml
```

Optional flags include:

- `--no-layout`: does not export layout
- `--no-styles`: does not export styles
- `--no-nflx`: does not export Netflix-specific metadata
- `--sort`: sorts events by start times
- `--origin-timecode HH:MM:SS:FF`: sets the DAPT Origin Timecode
- `--start-of-programme HH:MM:SS:FF`: sets the Start of Programme Timecode
- `--group-by <mode>`: groups events into nested `div` elements (a `div` containing child `div`s is not a DAPT Script Event; processors recurse into its children). `<mode>` is one of:
  - `cue`: events sharing the same `cue` value (2 or more events) are nested in a `cue_<value>` div
  - `loop`: events contained in a TTAL `loops` time span are nested in a `loop_<id>` div
  - `shot`: events starting between two `shotChanges` are nested in a `shot_<n>` div
  - `timing`: events sharing identical start and end times (2 or more events) are nested in a `sync_<start>_<end>` div

  Events that do not belong to any group remain top-level `div`s. Grouping `div`s carry an `xml:id` and, unless `--no-nflx` is set, Netflix-specific metadata describing the group; child event `div`s keep their absolute timing.

Run the following to convert the included test files:

```
./run-tests.js
```

The resulting DAPT/TTML can be viewed in compatible TTML/IMSC renderers, e.g. here:

https://www.sandflow.com/imsc1_1/index.html
