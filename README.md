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

Run the following to convert the included test files:

```
./run-tests.js
```

The resulting DAPT/TTML can be viewed in compatible TTML/IMSC renderers, e.g. here:

https://www.sandflow.com/imsc1_1/index.html
