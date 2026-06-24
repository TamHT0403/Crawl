import { YoutubeTranscript } from "youtube-transcript";

async function test() {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript("dQw4w9WgXcQ");
    console.log("Fetched successfully, first 5 items:");
    console.log(transcript.slice(0, 5));
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
