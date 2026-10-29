/**
 *
 *  Copyright 2025 Netflix, Inc.
 *
 *     Licensed under the Apache License, Version 2.0 (the "License");
 *     you may not use this file except in compliance with the License.
 *     You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 *     Unless required by applicable law or agreed to in writing, software
 *     distributed under the License is distributed on an "AS IS" BASIS,
 *     WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *     See the License for the specific language governing permissions and
 *     limitations under the License.
 *
 */


const fs = require('fs');
const { ArgumentParser } = require('argparse');

const argparser = new ArgumentParser({
	description: 'TTAL->DAPT converter'
	// 'Features not supported:\n'+
	// '- deletedEvents\n'+
	// '- lipDetection\n'+
	// '- Audio Description'
});

argparser.add_argument('--no-layout', { action: 'store_true', help: 'does not export layout' });
argparser.add_argument('--no-styles', { action: 'store_true', help: 'does not export styles' });
argparser.add_argument('--no-nflx', { action: 'store_true', help: 'does not export Netflix-specific metadata' });
argparser.add_argument('--sort', { action: 'store_true', help: 'sort events by start times' });
argparser.add_argument('--group-by', { choices: ['cue', 'loop', 'shot', 'timing'], help: 'group events into nested div elements: cue = events sharing the same cue value; loop = events contained in a TTAL loop (see top-level loops property); shot = events starting between shot changes (see top-level shotChanges property); timing = events sharing identical start and end times' });
argparser.add_argument('--origin-timecode', { help: 'DAPT Origin Timecode (SMPTE format: HH:MM:SS:FF)' });
argparser.add_argument('--start-of-programme', { help: 'Start of Programme Timecode (SMPTE format: HH:MM:SS:FF)' });
argparser.add_argument('input', { help: 'source TTAL file' });
argparser.add_argument('output', { help: 'output DAPT file' });

let args = argparser.parse_args();

const ttal = JSON.parse(fs.readFileSync(args.input,"utf8").replace(/^\uFEFF/, ""));

/**
 * Converts the Netflix TTAL type to DAPT Workflow type (Dubbing or AD)
 **/
function processTtalTypeForDAPTScriptRepresents(ttal) {
	let representsValuesSet = new Set();

	switch(ttal.meta.type) {
		case undefined:
		case null:
		case "":
			console.warn("Warning: TTAL type isn't specified, assuming Dialog List");
			representsValuesSet.add("audio.dialogue");
			break;
		case "DIALOG_LIST":
		case "DUB_SCRIPT":
			representsValuesSet.add("audio.dialogue");
			break;
		case "AUDIO_DESCRIPTION_SCRIPT":
			representsValuesSet.add("visual.nonText");
			representsValuesSet.add("visual.text");
			break;
		case "CLOSED_CAPTIONING":
			representsValuesSet.add("visual.dialogue");
			representsValuesSet.add("visual.text");
			representsValuesSet.add("audio.nonDialogueSounds");
			break;
		case "SUBTITLE":
		case "LANGUAGE_TEMPLATE":
		case "FORCED_NARRATIVE":
			representsValuesSet.add("visual.text");
			representsValuesSet.add("visual.dialogue");
			break;
		default:
			throw new Error("Type of Script is invalid, cannot set daptm:scriptRepresents value");
	}

	let eventRepresentsValues = findRepresents(ttal);
	let mergedValues = new Set(representsValuesSet);
	eventRepresentsValues.forEach(item => mergedValues.add(item));

	return Array.from(mergedValues).join(" ").trimStart().trimEnd().replace(/\s{2,}/g, ' ');
}

/**
 * Helper function to iterate through events and find all possible "represents" values in the script to set scriptRepresents
 **/
function findRepresents(ttal) {
	let eventRepresentsValues= new Set();

	// Transform the map of events into an array
	Object.keys(ttal.events).forEach((evtId) => ttal.events[evtId].evtId = evtId);
	let ttalEvents = Object.keys(ttal.events).map((evtId) => ttal.events[evtId]);
	if (args.sort) {
		ttalEvents = ttalEvents.sort(function(a,b) {
			return a.start - b.start;
		});
	}

	for(let e in ttalEvents) {
		eventRepresentsValues.add(findRepresentsForEvent(ttalEvents[e]));
	}

	return eventRepresentsValues;
}

/**
 * Helper function to return the "represents" value for a given event
 **/
function findRepresentsForEvent(evt) {
	if (evt.type === "fn") {
		return "visual.text";
	} else if (evt.dubAnnotations && evt.dubAnnotations.types.length > 0) {
		return processDubAnnotationsForDAPTRepresents(evt.dubAnnotations.types);
	}
}

/**
 * Converts the Netflix TTAL type to DAPT Represents Value
 **/
function processTtalTypeForDAPTRepresents(ttal) {
	switch(ttal.meta.type) {
		case undefined:
		case null:
		case "":
			console.warn("Warning: TTAL type isn't specified, assuming Dialog List");
			return "audio.dialogue";
		case "DIALOG_LIST":
		case "DUB_SCRIPT":
			return "audio.dialogue";
		case "AUDIO_DESCRIPTION_SCRIPT":
			return "visual.text";
		case "CLOSED_CAPTIONING":
			return "visual.dialogue";
		case "SUBTITLE":
		case "LANGUAGE_TEMPLATE":
		case "FORCED_NARRATIVE":
			return "visual.text";
		default:
			throw new Error("Type of Script is invalid, cannot set daptm:represents value");
	}
}

/**
 * Converts the Netflix TTAL type to DAPT Script type (original, translated, ...)
 **/
function processTtalTypeForDAPTScriptType(ttal) {
	switch(ttal.meta.type) {
		case undefined:
		case null:
		case "":
			console.warn("Warning: TTAL type isn't specified, assuming Dialog List");
			if (!ttal.meta.originalLanguage || ttal.meta.originalLanguage === "" || ttal.meta.lang === ttal.meta.originalLanguage)
				return "originalTranscript";
			else
				return "translatedTranscript";
		case "DIALOG_LIST":
		case "LANGUAGE_TEMPLATE":
		case "SUBTITLE":
		case "CLOSED_CAPTIONING":
			if (!ttal.meta.originalLanguage || ttal.meta.originalLanguage === "" || ttal.meta.lang === ttal.meta.originalLanguage)
				return "originalTranscript";
			else
				return "translatedTranscript";
		case "AUDIO_DESCRIPTION_SCRIPT":
		case "DUB_SCRIPT":
			return "asRecorded";
		case "FORCED_NARRATIVE":
			return "translatedTranscript";
		default:
			throw new Error("Type of Script is invalid, cannot set daptm:scriptType value");
	}
}

/**
 * The DAPT TT elements declares all required namespaces (TTML, DAPT)
 * including the namespaces needed for mapping proprietary Netflix metadata (EBU-TT, Netflix TT)
 **/
function generateTTElement(ttal) {
	let ttmlString = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?>\n";
	ttmlString +="<tt";

	// adding namespaces
	ttmlString += " xmlns=\"http://www.w3.org/ns/ttml\"";
	ttmlString += " xmlns:ttp=\"http://www.w3.org/ns/ttml#parameter\"";
	if (!args.no_styles) {
		ttmlString += " xmlns:tts=\"http://www.w3.org/ns/ttml#styling\"";
	}
	ttmlString += " xmlns:itts=\"http://www.w3.org/ns/ttml/profile/imsc1#styling\"";
	ttmlString += " xmlns:ttm=\"http://www.w3.org/ns/ttml#metadata\"";
	ttmlString += " xmlns:ebuttm=\"urn:ebu:tt:metadata\"";
	ttmlString += " xmlns:daptm=\"http://www.w3.org/ns/ttml/profile/dapt#metadata\"";
	if (!args.no_nflx) {
		ttmlString += " xmlns:nttm=\"http://www.netflix.com/ns/ttml#metadata\""; // Netflix Metadata Namespace
	}
	ttmlString += " ttp:contentProfiles=\"http://www.w3.org/ns/ttml/profile/dapt1.0/content\""; // Proposed W3C profile designator enabling identification of TTAL

	ttmlString += " ttp:frameRate=\""+getFrameRateNumerator(ttal.meta.fps)+"\"";
	if (getFrameRateDenominator(ttal.meta.fps) !== "1 1") {
		ttmlString += " ttp:frameRateMultiplier=\""+getFrameRateDenominator(ttal.meta.fps)+"\"";
	}

	// lang is mandatory in TTAL 0.9.7
	ttmlString += " xml:lang=\""+ttal.meta.lang+"\"";

	if (ttal.meta.type === "AUDIO_DESCRIPTION_SCRIPT") {
		ttmlString += " daptm:langSrc=\"\"";
	} else if (ttal.meta.originalLanguage === undefined) {
		ttmlString += " daptm:langSrc=\""+ttal.meta.lang+"\"";
	} else {
		ttmlString += " daptm:langSrc=\""+ttal.meta.originalLanguage+"\"";
	}

	ttmlString += " daptm:scriptRepresents=\""+processTtalTypeForDAPTScriptRepresents(ttal)+"\"";
	ttmlString += " daptm:represents=\""+processTtalTypeForDAPTRepresents(ttal)+"\"";
	ttmlString += " daptm:scriptType=\""+processTtalTypeForDAPTScriptType(ttal)+"\"";
	ttmlString += ">\n";

	return ttmlString;
}

/**
 * Processes the map of TTAL characters and generates the ttm:agent definitions per DAPT
 **/
function generateCharacters(characterMap) {
	let ttmlString = "";
	// The parts of TTAL character objects which are not style-related are
	// mapped onto metadata objects
	Object.keys(characterMap).forEach(function (characterId) {
		const character = characterMap[characterId];
		ttmlString+= "<ttm:agent";
		ttmlString+= " xml:id=\"character_"+characterId+"\"";
		ttmlString+= " type=\"character\""
		const excludeList = [ "name", "talent", "color"];
		if (!args.no_nflx) {
			for (let p in character) {
				if (excludeList.indexOf(p) > -1) continue;

				let characterPruned = pruneEmptyObjects(character[p]);
				if (!isEmptyValue(characterPruned)) {
					if (typeof characterPruned === "object") {
						ttmlString+= " nttm:"+p+"=\""+escapeTextAttributes(JSON.stringify(characterPruned))+"\"";
					} else {
						ttmlString+= " nttm:"+p+"=\""+characterPruned+"\"";
					}
				}
			}
		}
		ttmlString+= ">\n";
		ttmlString+= "<ttm:name type=\"alias\">"+character.name+"</ttm:name>\n";
		if (character.talent) {
			ttmlString+= "<ttm:actor agent=\"actor_"+characterId+"\"/>\n";
		}
		ttmlString+="</ttm:agent>\n";
		if (character.talent) {
			ttmlString+= "<ttm:agent";
			ttmlString+= " xml:id=\"actor_"+characterId+"\"";
			ttmlString+= " type=\"person\">\n";
			ttmlString+= "<ttm:name type=\"full\">"+character.talent+"</ttm:name>\n";
			ttmlString+="</ttm:agent>\n";
		}
	});

	return ttmlString;
}

/**
 * The Head has 3 parts:
 * - metadata for definition of characters and other Netflix-proprietary properties
 * - styling definition
 * - a default region definition
 **/
function generateHeadElement(ttal) {
	let ttmlString = "<head>\n";

	// The metadata section
	ttmlString += "<metadata";
	if (!args.no_nflx) {
		// The meta properties in TTAL that don't have a direct mapping to
		// TTML attributes are mapped to Netflix-proprietay metadata attributes for now
		Object.keys(ttal.meta).filter(key => !["fps", "lang", "type", "originalLanguage"].includes(key)).forEach(function (key) {

			let metaPruned = pruneEmptyObjects(ttal.meta[key]);
			if (!isEmptyValue(metaPruned)) {
				if (key === "title" || key === "episodeTitle") {
					ttmlString+=" nttm:"+key+"=\""+escapeTextAttributes(metaPruned)+"\"";
				} else {
					if (typeof metaPruned === "object") {
						ttmlString+=" nttm:"+key+"=\""+escapeTextAttributes(JSON.stringify(metaPruned))+"\"";
					} else {
						ttmlString+=" nttm:"+key+"=\""+metaPruned+"\"";
					}
				}
			}
		});

		// TTAL properties not defined in DAPT will be indicated as present in nttm namespace in metadata section, even if contents aren't made available
		if (ttal.deletedEvents) {
			let deletedEventsPruned = pruneEmptyObjects(ttal.deletedEvents);
			if (!isEmptyValue(deletedEventsPruned)) {
				ttmlString+=" nttm:"+"deletedEvents"+"=\""+escapeTextAttributes(JSON.stringify(deletedEventsPruned))+"\"";
			}
		}
		if (ttal.lipDetection) {
			let lipDetectionPruned = pruneEmptyObjects(ttal.lipDetection);
			if (!isEmptyValue(lipDetectionPruned)) {
				ttmlString+=" nttm:"+"lipDetection"+"=\""+escapeTextAttributes(JSON.stringify(lipDetectionPruned))+"\"";
			}
		}
		if (ttal.lipDetectionEvents) {
			let lipDetectionEventsPruned = pruneEmptyObjects(ttal.lipDetectionEvents);
			if (!isEmptyValue(lipDetectionEventsPruned)) {
				ttmlString+=" nttm:"+"lipDetectionEvents"+"=\""+escapeTextAttributes(JSON.stringify(lipDetectionEventsPruned))+"\"";
			}
		}
		if (ttal.lipDetectionEvent) {
			let lipDetectionEventPruned = pruneEmptyObjects(ttal.lipDetectionEvent);
			if (!isEmptyValue(lipDetectionEventPruned)) {
				ttmlString+=" nttm:"+"lipDetectionEvent"+"=\""+escapeTextAttributes(JSON.stringify(lipDetectionEventPruned))+"\"";
			}
		}
		if (ttal.lipDetectionAux) {
			let lipDetectionAuxPruned = pruneEmptyObjects(ttal.lipDetectionAux);
			if (!isEmptyValue(lipDetectionAuxPruned)) {
				ttmlString+=" nttm:"+"lipDetectionAux"+"=\""+escapeTextAttributes(JSON.stringify(lipDetectionAuxPruned))+"\"";
			}
		}
		if (ttal.referenceScript) {
			let referenceScriptPruned = pruneEmptyObjects(ttal.referenceScript);
			if (!isEmptyValue(referenceScriptPruned)) {
				ttmlString+=" nttm:"+"referenceScript"+"=\""+escapeTextAttributes(JSON.stringify(referenceScriptPruned))+"\"";
			}
		}
		if (ttal.notes) {
			let notesPruned = pruneEmptyObjects(ttal.notes);
			if (!isEmptyValue(notesPruned)) {
				ttmlString+=" nttm:"+"notes"+"=\""+escapeTextAttributes(JSON.stringify(notesPruned))+"\"";
			}
		}
		if (ttal.issues) {
			let issuesPruned = pruneEmptyObjects(ttal.issues);
			if (!isEmptyValue(issuesPruned)) {
				ttmlString+=" nttm:"+"issues"+"=\""+escapeTextAttributes(JSON.stringify(issuesPruned))+"\"";
			}
		}
		if (ttal.diffs) {
			let diffsPruned = pruneEmptyObjects(ttal.diffs);
			if (!isEmptyValue(diffsPruned)) {
				ttmlString+=" nttm:"+"diffs"+"=\""+escapeTextAttributes(JSON.stringify(diffsPruned))+"\"";
			}
		}
		if (ttal.trackings) {
			let trackingsPruned = pruneEmptyObjects(ttal.trackings);
			if (!isEmptyValue(trackingsPruned)) {
				ttmlString+=" nttm:"+"trackings"+"=\""+escapeTextAttributes(JSON.stringify(trackingsPruned))+"\"";
			}
		}
		if (ttal.summary) {
			let summaryPruned = pruneEmptyObjects(ttal.summary);
			if (!isEmptyValue(summaryPruned)) {
				ttmlString+=" nttm:"+"summary"+"=\""+escapeTextAttributes(JSON.stringify(summaryPruned))+"\"";
			}
		}
		if (ttal.scenes) {
			let scenesPruned = pruneEmptyObjects(ttal.scenes);
			if (!isEmptyValue(scenesPruned)) {
				ttmlString+=" nttm:"+"scenes"+"=\""+escapeTextAttributes(JSON.stringify(scenesPruned))+"\"";
			}
		}
		if (ttal.loops) {
			let loopsPruned = pruneEmptyObjects(ttal.loops);
			if (!isEmptyValue(loopsPruned)) {
				ttmlString+=" nttm:"+"loops"+"=\""+escapeTextAttributes(JSON.stringify(loopsPruned))+"\"";
			}
		}
		if (ttal.shotChanges) {
			let shotChangesPruned = pruneEmptyObjects(ttal.shotChanges);
			if (!isEmptyValue(shotChangesPruned)) {
				ttmlString+=" nttm:"+"shotChanges"+"=\""+escapeTextAttributes(JSON.stringify(shotChangesPruned))+"\"";
			}
		}
	}

	ttmlString+=">\n";

	// Add timecode metadata if provided
	if (args.origin_timecode) {
		ttmlString+= "<daptm:daptOriginTimecode>"+args.origin_timecode+"</daptm:daptOriginTimecode>\n";
	}
	if (args.start_of_programme) {
		ttmlString+= "<ebuttm:documentStartOfProgramme>"+args.start_of_programme+"</ebuttm:documentStartOfProgramme>\n";
	}

	ttmlString+= generateCharacters(ttal.characters);
	ttmlString+="</metadata>\n";

	if (!args.no_styles) {
		// The styling section for defining character-styles
		ttmlString+="<styling>\n";
		// default style for non-spoken text
		ttmlString+= "<style xml:id=\"style_00000000-0000-0000-0000-000000000000\"/>\n";
		// The color part of TTAL character objects is mapped onto a style element
		// with the style_<characterid> being the XML id of this element
		Object.keys(ttal.characters).forEach(function (characterId) {
			const character = ttal.characters[characterId];
			ttmlString+= "<style";
			ttmlString+= " xml:id=\"style_"+characterId+"\"";
			if (character.color) {
				ttmlString+= " tts:color=\""+character.color.ink+"\"";
				ttmlString+= " tts:backgroundColor=\""+character.color.surface+"\"";
			}
			ttmlString+= " ttm:agent=\"character_"+characterId+"\"";
			ttmlString+="/>\n";
		});
		ttmlString+="</styling>\n";
	}

	if (!args.no_layout) {
		// No specific region is defined as of v0.9.7
		// The following defines a basic region
		ttmlString+="<layout>\n";
		if (ttal.meta.lang === "ja") {
			ttmlString+="<region xml:id=\"top\" tts:displayAlign=\"before\" tts:extent=\"80.000% 80.000%\" tts:origin=\"10.000% 10.000%\" tts:writingMode=\"lrtb\"/>\n";
			ttmlString+="<region xml:id=\"bottom\" tts:displayAlign=\"after\" tts:extent=\"80.000% 80.000%\" tts:origin=\"10.000% 10.000%\" tts:writingMode=\"lrtb\"/>\n";
			ttmlString+="<region xml:id=\"left\" tts:displayAlign=\"after\" tts:extent=\"80.000% 80.000%\" tts:origin=\"10.000% 10.000%\" tts:writingMode=\"tblr\"/>\n";
			ttmlString+="<region xml:id=\"right\" tts:displayAlign=\"after\" tts:extent=\"80.000% 80.000%\" tts:origin=\"10.000% 10.000%\" tts:writingMode=\"tbrl\"/>\n";
		} else {
			ttmlString+="<region xml:id=\"bottom\" tts:displayAlign=\"after\" tts:extent=\"80.000% 80.000%\" tts:origin=\"10.000% 10.000%\" tts:writingMode=\"lrtb\"/>\n";

			// Adding any additional regions (based on if they're specified within events)
			// Transform the map of events into an array
			Object.keys(ttal.events).forEach((evtId) => ttal.events[evtId].evtId = evtId);
			let ttalEvents = Object.keys(ttal.events).map((evtId) => ttal.events[evtId]);
			if (args.sort) {
				ttalEvents = ttalEvents.sort(function(a,b) {
					return a.start - b.start;
				});
			}

			// Add any additional regions needed here
			for(let e in ttalEvents) {
				let event = ttalEvents[e];
				if (event.rgn) {
					if (event.rgn === "top") {
						ttmlString+="<region xml:id=\"top\" tts:displayAlign=\"before\" tts:extent=\"80.000% 80.000%\" tts:origin=\"10.000% 10.000%\" tts:writingMode=\"lrtb\"/>\n";
					} else if (event.rgn === "right") {
						ttmlString+="<region xml:id=\"right\" tts:displayAlign=\"after\" tts:extent=\"80.000% 80.000%\" tts:origin=\"10.000% 10.000%\" tts:writingMode=\"tbrl\"/>\n";
					} else if (event.rgn === "left") {
						ttmlString+="<region xml:id=\"left\" tts:displayAlign=\"after\" tts:extent=\"80.000% 80.000%\" tts:origin=\"10.000% 10.000%\" tts:writingMode=\"tblr\"/>\n";
					}
				}
			}
		}

		ttmlString+="</layout>\n";
	}

	ttmlString+="</head>\n";

	return ttmlString;
}

/** Escapes basic XML entities per DAPT and carriage returns **/
function escapeText(text) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
		.replace(/\n/g,'<br/>');
}

/** Escapes basic XML entities per DAPT and carriage returns for ttm:desc element textual content, specifically doesn't escape single or double quotes **/
function escapeTextDesc(text) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\n/g,' ');
}

/** Escapes basic XML entities per DAPT and carriage returns for XML attributes, specifically doesn't escape single quotes **/
function escapeTextAttributes(text) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/\n/g,'<br/>');
}

/** Escapes basic XML entities per DAPT and carriage returns for XML element content, specifically doesn't escape single or double quotes **/
function escapeTextElementContent(text) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\n/g,'<br/>');
}

function generateStyleAttribute(style) {
	if (!args.no_styles) {
		if (style === "italic") {
			return "tts:fontStyle=\"italic\"";
		} else if (style === "bold") {
			return "tts:fontWeight=\"bold\"";
		}
	} else {
		return "";
	}
}

/** Checks if provided value is 'empty' and therefore not worth including in DAPT output **/
function isEmptyValueTest(value) {
	if (value === undefined || value === null || value === "" || (typeof value === 'number' && isNaN(value))) {
		return "1";
	}

	if (Array.isArray(value) && value.length === 0) {
		return "2";
	}

	if (typeof value === 'object' && value.constructor === Object && Object.keys(value).length === 0) {
		return "3";
	}
}

/** Checks if provided value is 'empty' and therefore not worth including in DAPT output **/
function isEmptyValue(value) {
	if (value === undefined || value === null || value === "" || (typeof value === 'number' && isNaN(value))) {
		return true;
	}

	if (Array.isArray(value) && value.length === 0) {
		return true;
	}

	return typeof value === 'object' && value.constructor === Object && Object.keys(value).length === 0;
}

/** Prune any empty objects or empty values from provided TTAL values so they don't clutter the DAPT output with empty/non-existent data structures **/
function pruneEmptyObjects(obj) {
	if (!obj || typeof obj !== 'object') {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(pruneEmptyObjects).filter(item => !isEmptyValue(item));
	}

	const newObj = {};
	for (const key in obj) {
		if (obj.hasOwnProperty(key)) {
			const value = pruneEmptyObjects(obj[key]);
			if (!isEmptyValue(value)) {
				newObj[key] = value;
			}
		}
	}
	return Object.keys(newObj).length > 0 ? newObj : undefined;
}

/**
 * Generates a paragraph (escaping text, applying styles and segments) and marking it per DAPT
 * depending on which language it is.
 **/
function generateParagraph(evtText, evtStyles, evtSegments, evtRubies, isTranscription, evtStart, evtEnd) {
	let ttmlString = "<p";
	if (isTranscription) {
		ttmlString += " daptm:langSrc=\""+ttal.meta.originalLanguage+"\"";
		ttmlString += " xml:lang=\""+ttal.meta.originalLanguage+"\"";
	} else {
		if (ttal.meta.originalLanguage) {
			ttmlString += " daptm:langSrc=\""+ttal.meta.originalLanguage+"\"";
		} else {
			ttmlString += " daptm:langSrc=\""+ttal.meta.lang+"\"";
		}

		ttmlString += " xml:lang=\""+ttal.meta.lang+"\"";
	}
	ttmlString += ">";

	if ((evtStyles && evtStyles.length > 0) && (evtSegments && evtSegments.length > 0)) {
		// Constructing map of segment metadata and segment text
		const segmentsMap = new Map();
		let prevOffset = 0;
		let prevFrame = 0;
		for (let i = 0; i < evtSegments.length; i++) {
			let segmentObject = evtSegments[i];
			segmentsMap.set([prevOffset, segmentObject.textOffset, prevFrame, segmentObject.frame], evtText.substring(prevOffset, segmentObject.textOffset));
			prevOffset = segmentObject.textOffset;
			prevFrame = segmentObject.frame;
		}
		segmentsMap.set([prevOffset, evtText.length, prevFrame, evtEnd - evtStart], evtText.substring(prevOffset, evtText.length));

		// Pre-process styles by breaking them up if they overlap or overlap segments
		let evtStylesProcessed = preProcessStyles(evtStyles, segmentsMap);

		// Build Paragraph
		const segmentsAndStyles = [];
		for (let [key, value] of segmentsMap) {
			// Find styles that need to be added to this segment
			const stylesInSegment = [];
			for (let i = 0; i < evtStylesProcessed.length; i++) {
				let styleObject = evtStylesProcessed[i];
				if (styleObject.from >= key[0] && styleObject.to <= key[1]) {
					let newStyle = {...styleObject};
					stylesInSegment.push(newStyle);
				}
			}

			let segmentText = value;
			let segmentSplitByStyles = [];
			let prevIndex = 0;
			for (let style of stylesInSegment) {
				// normalize and shift indices to be 0 indexed
				let startNormalizedIndex = style.from - key[0];
				let endNormalizedIndex = style.to - key[0];

				// This is a case where we encounter either a nested style or overlapping style, the logic for which will be handled separately after encountering a normal style, can ignore if we encounter such a style
				if (startNormalizedIndex < prevIndex) {
					continue;
				}

				// Add any previous non-styled text before this current style
				let prevText = escapeTextElementContent(segmentText.substring(prevIndex, startNormalizedIndex));
				segmentSplitByStyles.push(prevText);

				// Processing the style object itself, checking if there are other nested styles or overlapping styles in evtStyles
				let styleTextPreNest = escapeTextElementContent(segmentText.substring(startNormalizedIndex, endNormalizedIndex));
				let styleTextPostNest = "";
				if (style.type === "ruby") {
					let id = style.id;
					let rubyText = evtRubies[id].txt;
					styleTextPostNest = "<span tts:ruby=\"base\">" + styleTextPreNest + "</span>" + "<span tts:ruby=\"text\">" + rubyText + "</span>";
					styleTextPostNest = "<span tts:ruby=\"container\">" + styleTextPostNest + "</span>";
				} else {
					let styleTextAddNesting = addStyleNesting(styleTextPreNest, style, evtStylesProcessed);
					styleTextPostNest = "<span "+generateStyleAttribute(style.type)+">" + styleTextAddNesting + "</span>";
				}

				segmentSplitByStyles.push(styleTextPostNest);
				prevIndex = endNormalizedIndex;
			}

			let lastText = escapeTextElementContent(segmentText.substring(prevIndex, segmentText.length));
			segmentSplitByStyles.push(lastText);
			let startFrame = getStringTime(key[2], ttal.meta.fps);
			let endFrame = getStringTime(key[3], ttal.meta.fps);
			let segmentString = "<span begin=\"" + startFrame +"\" end=\"" + endFrame + "\">" + segmentSplitByStyles.join("") + "</span>"
			segmentsAndStyles.push(segmentString);
		}

		ttmlString += segmentsAndStyles.join("");
	} else if (evtSegments && evtSegments.length > 0) {
		const evtTextSplitBySegments = [];
		let prevOffset = 0;
		let prevFrame = 0;

		for (let i = 0; i < evtSegments.length; i++) {
			let segmentObject = evtSegments[i];
			let beginFrame = getStringTime(prevFrame, ttal.meta.fps);
			let endFrame = getStringTime(segmentObject.frame, ttal.meta.fps);
			let escapedSegmentText = escapeTextElementContent(evtText.substring(prevOffset, segmentObject.textOffset));
			evtTextSplitBySegments.push("<span begin=\"" + beginFrame+"\" end=\"" + endFrame + "\">" + escapedSegmentText + "</span>");
			prevOffset = segmentObject.textOffset;
			prevFrame = segmentObject.frame;
		}

		let startFrame = getStringTime(prevFrame, ttal.meta.fps);
		let lastFrame = getStringTime(evtEnd - evtStart, ttal.meta.fps);
		let lastEscapedSegmentText = escapeTextElementContent(evtText.substring(prevOffset, evtText.length));
		evtTextSplitBySegments.push("<span begin=\"" + startFrame +"\" end=\"" + lastFrame + "\">" + lastEscapedSegmentText + "</span>");
		ttmlString += evtTextSplitBySegments.join("");
	} else if (evtStyles && evtStyles.length > 0) {
		const evtTextSplitByStyles = [];
		let prevIndex = 0;
		let evtStylesProcessed = preProcessStyles(evtStyles, null);

		for (let i = 0; i < evtStylesProcessed.length; i++) {
			let styleObject = evtStylesProcessed[i];

			// This is a case where we encounter either a nested style or overlapping style, the logic for which will be handled separately after encountering a normal style, can ignore if we encounter such a style
			if (styleObject.from < prevIndex) {
				continue;
			}

			// Add any previous non-styled text before this current style
			let prevText = escapeTextElementContent(evtText.substring(prevIndex, styleObject.from));
			evtTextSplitByStyles.push(prevText);

			// Processing the style object itself, checking if there are other nested styles or overlapping styles in evtStylesProcessed
			let styleTextPreNest = escapeTextElementContent(evtText.substring(styleObject.from, styleObject.to));
			let styleTextPostNest = "";
			if (styleObject.type === "ruby") {
				let id = styleObject.id;
				let rubyText = evtRubies[id].txt;
				styleTextPostNest = "<span tts:ruby=\"base\">" + styleTextPreNest + "</span>" + "<span tts:ruby=\"text\">" + rubyText + "</span>";
				styleTextPostNest = "<span tts:ruby=\"container\">" + styleTextPostNest + "</span>";
			} else {
				let styleTextAddNesting = addStyleNesting(styleTextPreNest, styleObject, evtStylesProcessed);
				styleTextPostNest = "<span "+generateStyleAttribute(styleObject.type)+">" + styleTextAddNesting + "</span>";
			}
			evtTextSplitByStyles.push(styleTextPostNest);
			prevIndex = styleObject.to;
		}

		let lastText = escapeTextElementContent(evtText.substring(prevIndex, evtText.length));
		evtTextSplitByStyles.push(lastText);
		ttmlString += evtTextSplitByStyles.join("");
	} else {
		ttmlString += escapeTextElementContent(evtText);
	}

	ttmlString += "</p>\n";
	return ttmlString;
}

/**
 * Helper function to preprocess given styles:
 * Make sure any provided rubies nest within segments, and don't touch other styles (will allow nesting within styles in the future as well as overlaps potentially)
 * Break up overlapping styles into non-overlapping, potentially nested styles
 * Break up styles that overlap segments into separate styles
 * Sort styles by increasing order of "from" index, and descending "to" index when "from" indices are the same
 **/
function preProcessStyles(evtStyles, segmentsMap) {
	// For any ruby styles, check that they don't touch any other styles, will later modify logic to accommodate ruby nesting within styles, and overlaps and style/segment nesting within rubies
	for (let i = 0; i < evtStyles.length; i++) {
		let styleObjectFirst = evtStyles[i];
		if (styleObjectFirst.type === "ruby") {
			for (let j = 0; j < evtStyles.length; j++) {
				let styleObjectSecond = evtStyles[j];
				if (styleObjectSecond.type === "ruby" && styleObjectSecond.id === styleObjectFirst.id) {
					continue;
				}
				if (styleObjectSecond.from >= styleObjectFirst.from && styleObjectSecond.from < styleObjectFirst.to) {
					throw new Error("Ruby styles overlapping other styles or nesting other styles are not yet supported");
				}
				if (styleObjectSecond.to > styleObjectFirst.from && styleObjectSecond.to <= styleObjectFirst.to) {
					throw new Error("Ruby styles overlapping other styles are not yet supported");
				}
				if (styleObjectFirst.from >= styleObjectSecond.from && styleObjectFirst.to <= styleObjectSecond.to) {
					throw new Error("Ruby styles nested within other styles are not yet supported");
				}
			}
		}
	}

	// For any ruby styles, check that they don't overlap segments and that segments are not nested within them (we want rubies to be nested within segments)
	for (let i = 0; i < evtStyles.length; i++) {
		let styleObject = evtStyles[i];
		if (styleObject.type === "ruby") {
			if (segmentsMap) {
				for (let [key, value] of segmentsMap) {
					if (styleObject.from >= key[0] && styleObject.from < key[1] && styleObject.to > key[1]) {
						throw new Error("Ruby styles overlapping segments are not yet supported");
					}
					if (styleObject.to <= key[1] && styleObject.to > key[0] && styleObject.from < key[0]) {
						throw new Error("Ruby styles overlapping segments are not yet supported");
					}
					if ((key[0] > styleObject.from && key[1] <= styleObject.to) || (key[0] >= styleObject.from && key[1] < styleObject.to)) {
						throw new Error("Ruby styles nesting segments are not yet supported");
					}
				}
			}
		}
	}


	// Remove style overlaps by splitting overlaps and preserving already nested styles
	const evtStylesRemoveStyleOverlaps = [];
	for (let i = 0; i < evtStyles.length; i++) {
		let styleObjectFirst = evtStyles[i];
		let noSplitStyle = true;
		for (let j = 0; j < evtStyles.length; j++) {
			let styleObjectSecond = evtStyles[j];
			// If we find that the first style starts within and extends past the second style, then process first style as two separate styles
			if ((styleObjectFirst.from > styleObjectSecond.from) &&
				(styleObjectFirst.from < styleObjectSecond.to) &&
				(styleObjectFirst.to > styleObjectSecond.to)) {
				noSplitStyle = false;
				const firstNewStyle = {...styleObjectFirst};
				const secondNewStyle = {...styleObjectFirst};
				firstNewStyle.to = styleObjectSecond.to;
				secondNewStyle.from = styleObjectSecond.to;
				evtStylesRemoveStyleOverlaps.push(firstNewStyle);
				evtStylesRemoveStyleOverlaps.push(secondNewStyle);
			}
		}
		if (noSplitStyle) {
			evtStylesRemoveStyleOverlaps.push(styleObjectFirst);
		}
	}

	// Remove style overlaps with segments, break up styles accordingly
	let evtStylesRemoveSegmentOverlaps = [];
	if (segmentsMap) {
		for (let i = 0; i < evtStylesRemoveStyleOverlaps.length; i++) {
			let styleObject = evtStylesRemoveStyleOverlaps[i];
			let nestedInSegment = false;
			for (let [key, value] of segmentsMap) {
				if (styleObject.from >= key[0] && styleObject.to <= key[1]) {
					nestedInSegment = true;
					break;
				}
			}

			if (nestedInSegment) {
				evtStylesRemoveSegmentOverlaps.push(styleObject);
			} else {
				let prevFrom = styleObject.from;
				for (let [key, value] of segmentsMap) {
					if (prevFrom >= key[0] && prevFrom < key[1]) {
						let newStyle = {...styleObject};
						newStyle.from = prevFrom;
						newStyle.to = Math.min(styleObject.to, key[1]);
						evtStylesRemoveSegmentOverlaps.push(newStyle);
						prevFrom = key[1];
					} else {
						continue;
					}

					if (prevFrom >= styleObject.to) {
						break;
					}
				}
			}
		}
	} else {
		evtStylesRemoveSegmentOverlaps = [...evtStylesRemoveStyleOverlaps]
	}


	// Sort resulting styles that do not overlap with each other or any segments
	const evtStylesSorted = [...evtStylesRemoveSegmentOverlaps]

	function compareStyles(a, b) {
		if (a.from === b.from) {
			return b.to - a.to;
		} else {
			return a.from - b.from;
		}
	}

	return evtStylesSorted.sort(compareStyles);
}

/**
 * Helper function to add nested styles to a block of text
 **/
function addStyleNesting(styleTextPreNest, styleObject, evtStylesProcessed) {
	let styleTextSplit = [];
	let prevIndex = 0;
	for (let i = 0; i < evtStylesProcessed.length; i++) {
		let newStyle = evtStylesProcessed[i];

		// Normalize indices to splice into provided styleTextPreNest
		let startNormalizedIndex = newStyle.from - styleObject.from;
		let endNormalizedIndex = newStyle.to - styleObject.from;

		if ((newStyle.from >= styleObject.from) && (newStyle.to <= styleObject.to) &&
			(newStyle.from !== styleObject.from || newStyle.to !== styleObject.to || newStyle.type !== styleObject.type)) {
			if (startNormalizedIndex < prevIndex) {
				throw new Error("Styles nested past two levels, bad input styles can't be processed");
			}

			// Add non styled text that comes before current style
			let prevText = escapeTextElementContent(styleTextPreNest.substring(prevIndex, startNormalizedIndex));
			styleTextSplit.push(prevText);

			// Process current style itself and add to array
			let newStyleText = escapeTextElementContent(styleTextPreNest.substring(startNormalizedIndex, endNormalizedIndex));
			let newStyleTextWithSpans = "<span "+generateStyleAttribute(newStyle.type)+">" + newStyleText + "</span>";
			styleTextSplit.push(newStyleTextWithSpans);

			prevIndex = endNormalizedIndex;
		}
	}
	let lastText = escapeTextElementContent(styleTextPreNest.substring(prevIndex, styleTextPreNest.length));
	styleTextSplit.push(lastText);

	return styleTextSplit.join("");
}

function getFrameRateNumerator(frameRateString) {
	switch (frameRateString) {
		case "FPS_2397": return 24;
		case "FPS_2400": return 24;
		case "FPS_2500": return 25;
		case "FPS_2997": return 30;
		case "FPS_3000": return 30;
		case "FPS_5000": return 50;
		case "FPS_5994": return 60
		case "FPS_6000": return 60;
	}
	return -1;
}

function getFrameRateDenominator(frameRateString) {
	switch (frameRateString) {
		case "FPS_2397": return "1000 1001";
		case "FPS_2400": return "1 1";
		case "FPS_2500": return "1 1";
		case "FPS_2997": return "1000 1001";
		case "FPS_3000": return "1 1";
		case "FPS_5000": return "1 1";
		case "FPS_5994": return "1000 1001";
		case "FPS_6000": return "1 1";
	}
	return 0;
}

function getFrameRateValue(frameRateString) {
	return getFrameRateNumerator(frameRateString)/getFrameRateDenominator(frameRateString);
}

function getStringTime(frameNumber, frameRateString) {
	// let val = Math.round(frameNumber * 1000 / getFrameRateValue(frameRateString))/1000;
	// return val+"s";
	return frameNumber+"f";
}

/**
 * Helper function to merge characterId and characterIds,
 * remove duplicates, and generate a TTML valid id (not starting with a number)
 **/
function generateTtmAgent(characterId, characterIds) {
	if (!characterIds) {
		characterIds = [];
		characterIds.push(characterId);
	}
	let found = false;
	let ids = "";
	let first = true;
	for (let c in characterIds) {
		if (characterIds[c] == characterId) {
			found = true;
		}
		if (characterIds[c] == '00000000-0000-0000-0000-000000000000') {
			continue;
		}
		if (!first) {
			ids += " ";
		}
		ids += "character_"+characterIds[c];
		first = false;
	}
	if (!found) {
		ids += " character_"+characterId;
	}
	if (ids.length > 0) {
		return " ttm:agent=\""+ids+"\"";
	} else {
		return "";
	}
}

/**
 * An Event generates a div with possible metadata and text content
 **/
function generateEvent(evt) {
	let ttmlString ="<div";
	ttmlString+= " xml:id=\"event_"+evt.evtId+"\"";
	ttmlString+= " begin=\""+getStringTime(evt.start, ttal.meta.fps)+"\"";
	ttmlString+= " end=\""+getStringTime(evt.end, ttal.meta.fps)+"\"";
	ttmlString+= generateTtmAgent(evt.characterId, evt.characterIds);

	if (!args.no_styles) {
		ttmlString+= " style=\"style_"+evt.characterId+"\"";
	}
	ttmlString+= " daptm:onScreen=\""+(evt.onScreen || "ON")+"\"";

	if (evt.type === "fn") {
		ttmlString+= " daptm:represents=\"visual.text\"";
	} else if (evt.dubAnnotations && evt.dubAnnotations.types.length > 0) {
		ttmlString+= " daptm:represents=\""+processDubAnnotationsForDAPTRepresents(evt.dubAnnotations.types)+"\"";
	}

	if (!args.no_layout) {
		if (evt.rgn) {
			ttmlString += " region=\""+evt.rgn+"\"";
		} else {
			ttmlString += " region=\"bottom\"";
		}
	}
	ttmlString+= ">\n";

	if (evt.dubAnnotations && containsDubAnnotationForDAPTDescType(evt.dubAnnotations.types)) {
		if (evt.dubAnnotations.text && evt.dubAnnotations.text !== "") {
			ttmlString+= "<ttm:desc daptm:descType=\""+processDubAnnotationForDAPTDescType(evt.dubAnnotations.types)+"\">"+escapeTextDesc(evt.dubAnnotations.text)+"</ttm:desc>\n";
		} else {
			ttmlString+= "<ttm:desc daptm:descType=\""+processDubAnnotationForDAPTDescType(evt.dubAnnotations.types)+"\">"+" "+"</ttm:desc>\n";
		}
	}
	let metadata = "";
	if (!args.no_nflx) {
		// For properties in TTAL that don't have a direct mapping to TTML
		// attributes are mapped to Netflix-proprietay metadata attributes for now
		Object.keys(evt).filter(key => !["start", "end", "characterId", "characterIds", "txt", "transcriptionText",
			"segments", "dubAnnotations", "styles", "rubies", "transcriptionRubies", "transcriptionStyles", "pivotText", "pivotStyles", "onScreen", "evtId", "type", "rgn"].includes(key)).forEach(function (p) {
			if (evt[p]) {
				let evtAttr = pruneEmptyObjects(evt[p]);
				if (!isEmptyValue(evtAttr)) {
					if (typeof evtAttr === "object") {
						metadata +=" nttm:"+p+"=\""+escapeTextAttributes(JSON.stringify(evtAttr))+"\"";
					} else {
						metadata +=" nttm:"+p+"=\""+evtAttr+"\"";
					}
				}
			}
		});
	}
	if (metadata.length > 0) {
		ttmlString+= "<metadata"+metadata+"/>\n";
		//ttmlString+= "</metadata>\n";
	}

	let hasTranscription = evt.transcriptionText && evt.transcriptionText !== "";
	let hasPivot = evt.pivotText && evt.pivotText !== "";
	ttmlString += generateParagraph(evt.txt, evt.styles, evt.segments, evt.rubies,!hasTranscription && !hasPivot && ttal.meta.lang === ttal.meta.originalLanguage, evt.start, evt.end);
	if (hasTranscription) {
		ttmlString += generateParagraph(evt.transcriptionText, evt.transcriptionStyles, null, evt.transcriptionRubies, true, evt.start, evt.end);
	}
	if (hasPivot) {
		ttmlString += generateParagraph(evt.pivotText, evt.pivotStyles, null, evt.pivotRubies, true, evt.start, evt.end);
	}
	ttmlString+="</div>\n";

	return ttmlString;
}

/**
 * Checks if provided DubAnnotation type array has a value that maps to daptm:descType values (the type value describes part of the event or gives tangential information)
 **/
function containsDubAnnotationForDAPTDescType(types) {
	if (types.includes("Annotation.Context")) {
		return true;
	}
	if (types.includes("Annotation.Character")) {
		return true;
	}
	if (types.includes("Annotation.ForeignDialog")) {
		return true;
	}
	if (types.includes("Annotation.ArchivalFootage")) {
		return true;
	}
	if (types.includes("Annotation.ExistingIp")) {
		return true;
	}
	if (types.includes("Annotation.Inaudible")) {
		return true;
	}
	if (types.includes("Annotation.MainTitleInDialogue")) {
		return true;
	}
	if (types.includes("Annotation.EpisodeTitleInDialogue")) {
		return true;
	}
	if (types.includes("Annotation.SensitiveLanguage")) {
		return true;
	}
	if (types.includes("Annotation.EpisodicTitle")) {
		return true;
	}
	if (types.includes("Annotation.MainTitle")) {
		return true;
	}
	return false;
}

/**
 * Generates daptm:descType string based on provided Dub Annotation types
 **/
function processDubAnnotationForDAPTDescType(types) {
	let annotationString = "x-netflix-"
	for (let type of types) {
		switch (type) {
			case "Annotation.Context":
				annotationString += type.substring(11, type.length) + ".";
				break;
			case "Annotation.Character":
				annotationString += type.substring(11, type.length) + ".";
				break;
			case "Annotation.ForeignDialog":
				annotationString += type.substring(11, type.length) + ".";
				break;
			case "Annotation.ArchivalFootage":
				annotationString += type.substring(11, type.length) + ".";
				break;
			case "Annotation.ExistingIp":
				annotationString += type.substring(11, type.length) + ".";
				break;
			case "Annotation.Inaudible":
				annotationString += type.substring(11, type.length) + ".";
				break;
			case "Annotation.MainTitleInDialogue":
				annotationString += type.substring(11, type.length) + ".";
				break;
			case "Annotation.EpisodeTitleInDialogue":
				annotationString += type.substring(11, type.length) + ".";
				break;
			case "Annotation.SensitiveLanguage":
				annotationString += type.substring(11, type.length) + ".";
				break;
			case "Annotation.EpisodicTitle":
				annotationString += type.substring(11, type.length) + ".";
				break;
			case "Annotation.MainTitle":
				annotationString += type.substring(11, type.length) + ".";
				break;
		}
	}
	return annotationString.substring(0, annotationString.length - 1);
}

/**
 * Converts DubAnnotations Values to corresponding daptm:represents values
 **/
function processDubAnnotationsForDAPTRepresents(types) {
	if (types.includes("Annotation.BurnedInSubs")) {
		return "visual.text.x-netflix-BurnedInSubs";
	}
	if (types.includes("Annotation.GraphicsInserts")) {
		return "visual.text.x-netflix-GraphicsInserts";
	}
	if (types.includes("Annotation.PrincipalPhotography")) {
		return "visual.text.x-netflix-PrincipalPhotography";
	}
	if (types.includes("Annotation.PrinciplePhotography")) {
		return "visual.text.x-netflix-PrincipalPhotography";
	}
	if (types.includes("Annotation.NetflixCredits")) {
		return "visual.text.credit";
	}
	if (types.includes("Annotation.SongsDitties")) {
		return "audio.x-netflix-SongsDitties";
	}
	if (types.includes("Annotation.EpisodicTitle")) {
		return "visual.text.title.x-netflix-episodic";
	}
	if (types.includes("Annotation.MainTitle")) {
		return "visual.text.title.x-netflix-main";
	}
	if (types.includes("Annotation.EpisodeTitleInDialogue")) {
		return "audio.dialogue";
	}
	if (types.includes("Annotation.MainTitleInDialogue")) {
		return "audio.dialogue";
	}
	if (types.includes("Annotation.Context")) {
		return "audio.dialogue";
	}
	if (types.includes("Annotation.Character")) {
		return "audio.dialogue";
	}
	if (types.includes("Annotation.ForeignDialog")) {
		return "audio.dialogue";
	}
	if (types.includes("Annotation.ArchivalFootage")) {
		return "audio.dialogue";
	}
	if (types.includes("Annotation.ExistingIp")) {
		return "audio.dialogue";
	}
	if (types.includes("Annotation.Inaudible")) {
		return "audio.dialogue";
	}
	if (types.includes("Annotation.SensitiveLanguage")) {
		return "audio.dialogue";
	}
	return "x-netflix";
}

/** Returns an XML-ID-safe version of the provided value (to be used with an alphabetic prefix) **/
function sanitizeXmlId(value) {
	return String(value).replace(/[^A-Za-z0-9_.-]/g, "_");
}

/**
 * Generates a grouping (non-Script-Event) div per DAPT: a div containing child divs
 * is not itself a Script Event, processors recurse into its children. The grouping div
 * only carries an xml:id and optional Netflix-proprietary metadata; child event divs
 * keep their absolute timing.
 **/
function generateGroupDiv(xmlId, metadataAttributes, memberEvents) {
	let ttmlString = "<div xml:id=\""+xmlId+"\">\n";
	if (metadataAttributes) {
		ttmlString += "<metadata"+metadataAttributes+"/>\n";
	}
	for (let e in memberEvents) {
		ttmlString += generateEvent(memberEvents[e]);
	}
	ttmlString += "</div>\n";
	return ttmlString;
}

/**
 * Groups events into nested divs based on the --group-by mode:
 * - cue: events sharing the same cue value (2 or more events)
 * - loop: events contained within a TTAL loop time span (see top-level loops property)
 * - shot: events starting between two shot changes (see top-level shotChanges property)
 * - timing: events sharing identical start and end times (2 or more events)
 * Events that do not belong to any group remain top-level divs.
 **/
function generateGroupedEvents(ttalEvents, mode) {
	// groups: list of { xmlId, metadata, members: [evt] }; each event belongs to at most one group
	const groups = [];
	const eventToGroup = new Map();

	if (mode === "cue") {
		const cueMembers = new Map();
		for (const evt of ttalEvents) {
			if (evt.cue !== undefined && evt.cue !== null && evt.cue !== "") {
				if (!cueMembers.has(evt.cue)) cueMembers.set(evt.cue, []);
				cueMembers.get(evt.cue).push(evt);
			}
		}
		for (const [cue, members] of cueMembers) {
			if (members.length < 2) continue;
			const group = {
				xmlId: "cue_"+sanitizeXmlId(cue),
				metadata: (args.no_nflx ? "" : " nttm:cue=\""+escapeTextAttributes(String(cue))+"\""),
				members: members
			};
			groups.push(group);
			members.forEach(evt => eventToGroup.set(evt, group));
		}
	} else if (mode === "loop") {
		if (Array.isArray(ttal.loops) && ttal.loops.length > 0) {
			const loops = ttal.loops.filter(l => l && typeof l.start === "number").sort((a, b) => a.start - b.start);
			const maxEventEnd = ttalEvents.reduce((m, evt) => Math.max(m, evt.end), 0);
			for (let i = 0; i < loops.length; i++) {
				const loop = loops[i];
				// per TTAL, a loop without an explicit end ends at the start of the next loop, or at proxy end
				const loopEnd = (typeof loop.end === "number") ? loop.end : (i + 1 < loops.length ? loops[i+1].start : maxEventEnd);
				const members = ttalEvents.filter(evt => evt.start >= loop.start && evt.end <= loopEnd && !eventToGroup.has(evt));
				if (members.length === 0) continue;
				let metadata = "";
				if (!args.no_nflx) {
					if (!isEmptyValue(loop.id)) metadata += " nttm:id=\""+escapeTextAttributes(String(loop.id))+"\"";
					if (!isEmptyValue(loop.type)) metadata += " nttm:type=\""+escapeTextAttributes(String(loop.type))+"\"";
					metadata += " nttm:start=\""+loop.start+"\"";
					metadata += " nttm:end=\""+loopEnd+"\"";
				}
				const group = {
					xmlId: "loop_"+(!isEmptyValue(loop.id) ? sanitizeXmlId(loop.id) : i+1),
					metadata: metadata,
					members: members
				};
				groups.push(group);
				members.forEach(evt => eventToGroup.set(evt, group));
			}
		}
	} else if (mode === "shot") {
		if (Array.isArray(ttal.shotChanges) && ttal.shotChanges.length > 0) {
			const starts = ttal.shotChanges.filter(s => s && typeof s.start === "number").map(s => s.start).sort((a, b) => a - b);
			for (let i = 0; i < starts.length; i++) {
				const shotStart = starts[i];
				const shotEnd = (i + 1 < starts.length) ? starts[i+1] : Infinity;
				const members = ttalEvents.filter(evt => evt.start >= shotStart && evt.start < shotEnd);
				if (members.length === 0) continue;
				const group = {
					xmlId: "shot_"+(i+1),
					metadata: (args.no_nflx ? "" : " nttm:start=\""+shotStart+"\""),
					members: members
				};
				groups.push(group);
				members.forEach(evt => eventToGroup.set(evt, group));
			}
		}
	} else if (mode === "timing") {
		const spanMembers = new Map();
		for (const evt of ttalEvents) {
			const key = evt.start+"_"+evt.end;
			if (!spanMembers.has(key)) spanMembers.set(key, []);
			spanMembers.get(key).push(evt);
		}
		for (const [key, members] of spanMembers) {
			if (members.length < 2) continue;
			const group = {
				xmlId: "sync_"+members[0].start+"_"+members[0].end,
				metadata: "",
				members: members
			};
			groups.push(group);
			members.forEach(evt => eventToGroup.set(evt, group));
		}
	}

	if (groups.length === 0) {
		console.warn("Warning: --group-by "+mode+" did not produce any groups; generating flat output");
	}

	// Emit events in their original order; a group is emitted at the position of its first member
	let ttmlString = "";
	const emittedGroups = new Set();
	for (const evt of ttalEvents) {
		const group = eventToGroup.get(evt);
		if (group) {
			if (emittedGroups.has(group)) continue;
			emittedGroups.add(group);
			ttmlString += generateGroupDiv(group.xmlId, group.metadata, group.members);
		} else {
			ttmlString += generateEvent(evt);
		}
	}
	return ttmlString;
}

/**
 * The body of the TTML document is simply a list of events
 **/
function generateBodyElement(ttal) {

	let ttmlString = "<body ";
	if (!args.no_layout) {
		ttmlString += (ttal.meta.lang === "ja" ? "" : "region=\"bottom\"");
	}
	ttmlString += ">\n";

	// Transform the map of events into an array
	Object.keys(ttal.events).forEach((evtId) => ttal.events[evtId].evtId = evtId);
	let ttalEvents = Object.keys(ttal.events).map((evtId) => ttal.events[evtId]);
	if (args.sort) {
		ttalEvents = ttalEvents.sort(function(a,b) {
			return a.start - b.start;
		});
	}

	if (args.group_by) {
		ttmlString += generateGroupedEvents(ttalEvents, args.group_by);
	} else {
		for(let e in ttalEvents) {
			ttmlString += generateEvent(ttalEvents[e]);
		}
	}

	ttmlString+="</body>\n";

	return ttmlString;
}

let ttmlString = generateTTElement(ttal);
ttmlString += generateHeadElement(ttal);
ttmlString += generateBodyElement(ttal);
ttmlString +="</tt>\n";

fs.writeFileSync(args.output, ttmlString, { encoding: "utf8"});
